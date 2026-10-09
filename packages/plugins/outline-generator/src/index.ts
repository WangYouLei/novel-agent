import type { Context } from '@novelagent/core'
import {
  FeatureExtensionPoint,
  SERVICE_IDS,
  type FeatureRequest,
  type FeatureResult,
  type ModelServiceLike,
} from '@novelagent/core'
import { BizError, LIMITS, type OutlineStructure } from '@novelagent/shared'

/**
 * 大纲生成插件（示例功能插件，文档 4.3 / PRD 6.2）
 *
 * 职责：
 * 1. 声明依赖 model-service（必需）——缺失时本插件不可用（PRD 5.4）
 * 2. 组装带风格指令与结构化标记的提示词
 * 3. 调用模型服务并解析 JSON 大纲
 * 4. 发布 outline-generated 事件（其他插件可订阅）
 *
 * 风格兼容性（PRD 3.5，本插件声明 mode=prefer）：
 * - 小说未选风格包 → 使用插件内置兜底风格（embeddedFallback）
 * - 已选风格包 → 使用用户风格（prefer 模式，不阻断）
 */
export default class OutlineGenerator extends FeatureExtensionPoint {
  readonly extensionId = 'outline-generator'
  readonly featureId = 'outline-generator'
  readonly featureName = '大纲生成'

  /** 插件内置兜底风格（styleRequirement.embeddedFallback） */
  private static readonly FALLBACK_PROMPT =
    '你是一位经验丰富的小说大纲策划师。请基于用户的创意，产出一个结构完整、节奏张弛有度的小说大纲。'

  constructor(ctx: Context, _config: Record<string, unknown>) {
    super(ctx, 'outline-generator', true)
  }

  async execute(request: FeatureRequest): Promise<FeatureResult> {
    const log = (msg: string) => console.log(`[outline-generator] ${msg}`)
    try {
      // 1. 获取模型服务（必需依赖，缺失时给出明确业务错误 —— 对应验收标准 5）
      const modelService = this.ctx.get(SERVICE_IDS.MODEL) as ModelServiceLike | undefined
      if (!modelService) {
        return {
          success: false,
          error: { code: 'MODEL_PROVIDER_MISSING', message: '缺少模型提供者，请检查模型服务或模型插件是否已启用' },
        }
      }

      const idea = String(request.input.idea ?? '').trim()
      if (!idea) {
        return { success: false, error: { code: 'BAD_IDEA', message: '创意描述不能为空' } }
      }

      // 2. 合并配置（Web 层已应用 schema 默认值，此处只做上限硬校验，PRD 4.3）
      const config = request.config ?? {}
      const chapterCount = Math.min(
        Number(config.chapterCount ?? 20),
        LIMITS.MAX_CHAPTERS_PER_GENERATION,
      )
      if (chapterCount > Number(config.chapterCount ?? 20)) {
        log(`章节数被服务端上限截断为 ${LIMITS.MAX_CHAPTERS_PER_GENERATION}`)
      }

      // 3. 构建提示词（带进度上报）
      request.emitProgress?.('prompt', 10, '正在构建提示词')
      const prompt = this.buildPrompt(idea, chapterCount, request)
      log(`构建提示词完成：${prompt.length} 字符，风格=${request.stylePack?.builtinKey ?? 'fallback'}`)

      // 4. 调用模型
      request.emitProgress?.('model', 30, '正在调用模型生成大纲')
      const response = await modelService.chat({
        prompt,
        systemPrompt: '你是一个专业的小说大纲生成引擎，必须输出合法的 JSON。',
        model: request.model.model,
        providerId: request.model.providerId,
        providerOptions: request.model.providerConfig,
        metadata: {
          userId: request.userId,
          sessionId: request.sessionId,
          novelId: request.novelId,
          stylePackId: request.stylePack?.id,
        },
      })

      // 5. 解析大纲结构
      request.emitProgress?.('parse', 80, '正在解析大纲结构')
      const outline = this.parseOutline(response.content)
      if (!outline) {
        return {
          success: false,
          error: { code: 'PARSE_FAILED', message: '模型输出无法解析为大纲结构，请重试' },
        }
      }
      // 章节数截断到请求值（模型可能多给）
      outline.chapters = outline.chapters.slice(0, chapterCount)

      // 6. 发布事件（可逆副作用：卸载插件时监听自动清理）
      this.ctx.emit('outline-generated', {
        userId: request.userId,
        novelId: request.novelId,
        sessionId: request.sessionId ?? '',
        outline,
        pluginId: this.featureId,
      })
      request.emitProgress?.('done', 100, '大纲生成完成')

      log(`大纲生成成功：${outline.chapters.length} 章`)
      return { success: true, data: outline }
    } catch (err) {
      if (err instanceof BizError) {
        // 业务错误（积分不足/模型缺失等）原样透传
        request.emitProgress?.('error', 100, err.message)
        return { success: false, error: { code: String(err.code), message: err.message } }
      }
      log(`大纲生成异常：${(err as Error).stack ?? err}`)
      request.emitProgress?.('error', 100, (err as Error).message)
      return { success: false, error: { code: 'INTERNAL', message: '大纲生成失败，请查看服务端日志' } }
    }
  }

  /**
   * 构建提示词：
   * - 结构化标记块（[STYLE:] [CHAPTERS:] [IDEA:]）供 mock 模型识别
   * - 风格包指令（prefer 模式：用户风格优先，未选用兜底）
   */
  private buildPrompt(idea: string, chapterCount: number, request: FeatureRequest): string {
    const style = request.stylePack
    const styleKey = style?.builtinKey ?? 'default'
    const styleGuidance = style
      ? `${style.content.promptGuidance}\n词汇偏好：${style.content.vocabPreferences.join('、')}`
      : OutlineGenerator.FALLBACK_PROMPT

    return [
      `请基于以下创意生成小说大纲，输出 JSON（结构：{title, logline, theme, chapters:[{no,title,summary}]}）。`,
      `风格要求：${styleGuidance}`,
      '',
      `[STYLE:${styleKey}]`,
      `[CHAPTERS:${chapterCount}]`,
      `[IDEA:${idea}]`,
      '',
      `创意描述：${idea}`,
      `请生成 ${chapterCount} 章的大纲，每章包含标题与 50-100 字梗概。`,
      `剧情转折频率：${String(request.config?.plotTwistFrequency ?? 'medium')}；`,
      `伏笔设计：${request.config?.includeForeshadowing === false ? '不需要' : '需要'}。`,
    ].join('\n')
  }

  /** 解析模型输出为大纲结构（容错：裸 JSON → 代码块 JSON → 失败） */
  private parseOutline(content: string): OutlineStructure | null {
    const candidates = [content, extractJsonBlock(content)]
    for (const text of candidates) {
      try {
        const parsed = JSON.parse(text) as OutlineStructure
        if (parsed && Array.isArray(parsed.chapters) && typeof parsed.title === 'string') {
          parsed.chapters = parsed.chapters.map((c, i) => ({ ...c, no: c.no ?? i + 1 }))
          return parsed
        }
      } catch {
        // 尝试下一个候选
      }
    }
    return null
  }
}

/** 从 markdown 代码块中提取 JSON 文本 */
function extractJsonBlock(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  return match?.[1]?.trim() ?? ''
}
