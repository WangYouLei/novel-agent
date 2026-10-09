import type { Context } from '@novelagent/core'
import {
  SERVICE_IDS,
  StyleGeneratorExtensionPoint,
  type ModelSelection,
  type ModelServiceLike,
  type StyleGenerateRequest,
} from '@novelagent/core'
import { BizError, ErrorCode, type StylePackContent } from '@novelagent/shared'

/**
 * 风格生成插件（STYLE_GENERATOR 扩展点的首个实现，PRD 3.4）
 *
 * 职责：
 * 1. 声明依赖 model-service（必需）——缺失时抛出明确业务错误
 * 2. 截断上传文本至配置上限，组装风格分析提示词
 *    （嵌入 [TASK:style-analysis] 结构化标记，内置 mock 模型据此走本地风格提取）
 * 3. 调用模型服务并解析 JSON 风格包（字段校验 + 兜底）
 */
export default class StyleGenerator extends StyleGeneratorExtensionPoint {
  readonly extensionId = 'style-generator'
  readonly generatorId = 'style-generator'
  readonly generatorName = '小说风格提取'

  constructor(ctx: Context, _config: Record<string, unknown>) {
    super(ctx, 'style-generator', true)
  }

  async generate(request: StyleGenerateRequest): Promise<StylePackContent> {
    const log = (msg: string) => console.log(`[style-generator] ${msg}`)
    try {
      // 1. 获取模型服务（必需依赖）
      const modelService = this.ctx.get(SERVICE_IDS.MODEL) as ModelServiceLike | undefined
      if (!modelService) {
        throw new BizError(
          ErrorCode.MODEL_PROVIDER_MISSING,
          '缺少模型提供者，请检查模型服务或模型插件是否已启用',
        )
      }

      const sourceText = (request.sourceText ?? '').trim()
      if (!sourceText) {
        throw new BizError(ErrorCode.BAD_REQUEST, '小说文本不能为空')
      }

      // 2. 读取选项（Web 层已合并 schema 默认值）
      const options = request.options ?? {}
      const model = options.model as ModelSelection | undefined
      if (!model) {
        throw new BizError(ErrorCode.BAD_REQUEST, '缺少模型选择')
      }
      const maxSourceChars = clamp(Number(options.maxSourceChars ?? 8000), 500, 50000)
      const sampleCount = clamp(Number(options.sampleCount ?? 5), 2, 10)
      const vocabCount = clamp(Number(options.vocabCount ?? 10), 3, 20)

      const excerpt = sourceText.slice(0, maxSourceChars)
      if (excerpt.length < sourceText.length) {
        log(`文本截断：${sourceText.length} → ${excerpt.length} 字`)
      }

      // 3. 组装提示词并调用模型
      const prompt = this.buildPrompt(excerpt, sampleCount, vocabCount)
      log(`构建提示词完成：${prompt.length} 字符`)

      const response = await modelService.chat({
        prompt,
        systemPrompt: '你是一位专业的小说文风分析师，必须输出合法的 JSON。',
        model: model.model,
        providerId: model.providerId,
        providerOptions: model.providerConfig,
        metadata: { userId: request.userId },
      })

      // 4. 解析风格包（容错：裸 JSON → 代码块 JSON → 字段兜底）
      const content = this.parseStylePack(response.content)
      if (!content) {
        throw new BizError(
          ErrorCode.GENERATION_FAILED,
          '模型输出无法解析为风格包，请重试或更换模型',
        )
      }

      log(`风格提取成功：风格词 ${content.vocabPreferences.length} 个，示例句 ${content.sampleSentences.length} 句`)
      return content
    } catch (err) {
      if (err instanceof BizError) throw err
      log(`风格提取异常：${(err as Error).stack ?? err}`)
      throw new BizError(ErrorCode.GENERATION_FAILED, '风格包生成失败，请查看服务端日志')
    }
  }

  /**
   * 构建提示词：
   * - [TASK:style-analysis] 等结构化标记供内置 mock 模型识别（本地提取风格）
   * - 对真实模型则是明确的任务说明与输出要求
   */
  private buildPrompt(excerpt: string, sampleCount: number, vocabCount: number): string {
    return [
      '请分析以下小说文本的写作风格，提取为可复用的写作风格包。',
      '输出 JSON，结构：{ "styleSummary": string, "promptGuidance": string, "vocabPreferences": string[], "sampleSentences": string[] }。',
      `要求：styleSummary 用一句话概括文风；promptGuidance 为可注入写作模型的风格指令（80-150 字，涵盖叙事视角、句式节奏、意象与用词偏好）；vocabPreferences 提取 ${vocabCount} 个最具风格辨识度的标志性词汇；sampleSentences 从原文中摘录 ${sampleCount} 句最能代表文风的句子（保持原样，不要改写）。`,
      '',
      '[TASK:style-analysis]',
      `[SAMPLES:${sampleCount}]`,
      `[VOCABS:${vocabCount}]`,
      '',
      '小说文本：',
      excerpt,
    ].join('\n')
  }

  /** 解析模型输出为风格包内容（容错：裸 JSON → 代码块 JSON → 字段兜底） */
  private parseStylePack(content: string): StylePackContent | null {
    const candidates = [content, extractJsonBlock(content)]
    for (const text of candidates) {
      try {
        const parsed = JSON.parse(text) as Partial<StylePackContent>
        if (parsed && typeof parsed === 'object') {
          const summary = String(parsed.styleSummary ?? '').trim()
          const guidance = String(parsed.promptGuidance ?? '').trim()
          if (!summary || !guidance) continue
          return {
            styleSummary: summary,
            promptGuidance: guidance,
            vocabPreferences: toStringArray(parsed.vocabPreferences),
            sampleSentences: toStringArray(parsed.sampleSentences),
          }
        }
      } catch {
        // 尝试下一个候选
      }
    }
    return null
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
}

/** 数值收敛到闭区间（配置可能被 UI 覆盖为越界值） */
function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(Math.round(value), min), max)
}

/** 从 markdown 代码块中提取 JSON 文本 */
function extractJsonBlock(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  return match?.[1]?.trim() ?? ''
}
