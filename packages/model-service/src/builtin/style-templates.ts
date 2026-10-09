import type { OutlineChapter, OutlineStructure } from '@novelagent/shared'

/**
 * 内置 mock 模型的风格化大纲模板
 * 纯本地实现（不调任何外部 API）：根据提示词中的风格标记与元信息，
 * 用风格化词汇库拼装大纲，保证不同风格包产出的内容差异明显（验收标准 6）
 */

type StyleKey = 'xuanhuan' | 'dushi' | 'scifi' | 'wuxia' | 'default'

interface StyleTemplate {
  /** 章节标题词库（{idea} 会替换为创意关键词） */
  titleParts: string[]
  /** 梗概句式（占位符：{idea} 创意、{n} 章节序号、{word} 主题词） */
  summaryPatterns: string[]
  theme: string
  loglinePattern: string
}

const TEMPLATES: Record<StyleKey, StyleTemplate> = {
  xuanhuan: {
    titleParts: ['灵脉初醒', '丹田气旋', '秘境试炼', '雷劫将至', '大能传承', '洞天福地', '逆天改命', '大道之音', '境界突破', '上古战场'],
    summaryPatterns: [
      '主角于凡尘中窥得一丝灵机，{idea}的因果就此展开，修炼之路自本章始。',
      '一场针对主角的阴谋在暗处酝酿，宗门大比在即，{word}的力量初露锋芒。',
      '主角闭关冲击新境界，出关之日却发现山门已换旗帜，恩怨再起。',
      '上古遗迹开启，各方大能齐聚，主角凭{word}之能险中求胜，机缘造化加身。',
      '宿敌联手设下必杀之局，主角以命换命打出逆转，自此名动一方。',
    ],
    theme: '逆天改命，证道长生',
    loglinePattern: '一个凡尘少年，因{idea}踏上修行路，于万族争锋中步步登临绝巅。',
  },
  dushi: {
    titleParts: ['深夜的写字楼', '末班地铁', '老城区的雨', '体检报告', '租约到期', '同学的婚礼', '凌晨两点的电话', '旧城改造', '饭局', '户口本'],
    summaryPatterns: [
      '主角在城市的夹缝中讨生活，{idea}的变故打乱了所有节奏，现实步步紧逼。',
      '一场饭局让旧事重提，主角在人情与利益间摇摆，{word}成为绕不开的坎。',
      '深夜加班后的一通电话，把主角拽回不愿面对的过去，抉择摆在面前。',
      '老城区拆迁在即，几代人的账翻了出来，亲情与生计难以两全。',
      '主角终于攥住了翻身的绳索，却发现代价是曾经最看重的的东西。',
    ],
    theme: '在城市的洪流里，普通人如何守住自己',
    loglinePattern: '一个普通都市人，因{idea}被推到人生十字路口，在现实与体面之间寻找出路。',
  },
  scifi: {
    titleParts: ['轨道上的幽灵', '冬眠舱警报', '拉格朗日点', '熵减协议', '算力边界', '光速壁垒', '冬眠者名单', '戴森残骸', '奇点前夜', '静默频段'],
    summaryPatterns: [
      '深空监测站捕获异常信号，{idea}的真相被封装在层层加密的数据里，倒计时开始。',
      '算力配额之争演变为公开冲突，主角必须在{word}与人性之间做出取舍。',
      '冬眠舰队提前唤醒了主角——按照推演，文明窗口期正在收窄。',
      '一次例行的轨道维护，揭开了尘封百年的殖民计划残骸，信息量远超预期。',
      '最终表决时刻到来，主角握有关键数据，而每个选项都意味着某种牺牲。',
    ],
    theme: '文明的尺度上，理性与人性如何共存',
    loglinePattern: '在一个被物理定律封锁的时代，{idea}成为撬动文明命运的变量。',
  },
  wuxia: {
    titleParts: ['烟雨渡口', '客栈夜雨', '残剑无名', '雁门旧事', '掌门印', '大漠孤烟', '恩怨了', '华山雪', '故人书', '归鞘'],
    summaryPatterns: [
      '江湖传言再起，{idea}的旧怨浮出水面，一名背剑的年轻人踏入了是非之地。',
      '客栈中各方人马暗流涌动，一封{word}的密信，把主角推向漩涡中心。',
      '比武之约如期而至，主角以不擅之技应敌，胜负之外另有隐情。',
      '师门旧案真相渐明，主角快意恩仇的一剑，却斩不断身后的江湖。',
      '恩怨终有一了，主角解剑归隐，只在雁门关外留下一坛祭故人的酒。',
    ],
    theme: '侠之大者，恩怨两难',
    loglinePattern: '一个身负旧怨的年轻人，因{idea}卷入江湖纷争，在恩仇与道义间走出自己的路。',
  },
  default: {
    titleParts: ['开端', '暗流', '转折', '交锋', '裂缝', '抉择', '风暴', '余波', '真相', '终章'],
    summaryPatterns: [
      '故事围绕{idea}展开，主角的日常被打破，命运的齿轮开始转动。',
      '冲突逐步升级，主角发现{word}背后的另一层真相。',
      '最艰难的抉择摆在面前，主角必须付出代价。',
      '尘埃落定，主角带着改变继续前行。',
    ],
    theme: '成长与抉择',
    loglinePattern: '一个关于{idea}的故事，在抉择与代价中走向终局。',
  },
}

/** 从提示词中解析 mock 需要的元信息（插件在 prompt 中嵌入的结构化标记块） */
export function parsePromptMeta(prompt: string): { styleKey: StyleKey; chapterCount: number; idea: string } {
  const styleMatch = prompt.match(/\[STYLE:([a-z]+)\]/)
  const styleKey = (styleMatch?.[1] ?? 'default') as StyleKey
  const countMatch = prompt.match(/\[CHAPTERS:(\d+)\]/)
  const chapterCount = countMatch ? Number(countMatch[1]) : 12
  const ideaMatch = prompt.match(/\[IDEA:([^\]]*)\]/)
  const idea = (ideaMatch?.[1] ?? '一个未被命名的创意').trim().slice(0, 30)
  return { styleKey: TEMPLATES[styleKey] ? styleKey : 'default', chapterCount, idea }
}

/** 按风格模板生成大纲结构（模拟真实模型的 JSON 输出） */
export function generateMockOutline(prompt: string): OutlineStructure {
  const { styleKey, chapterCount, idea } = parsePromptMeta(prompt)
  const tpl = TEMPLATES[styleKey]

  // 创意关键词：取创意描述的前几个字符作为主题词嵌入梗概
  const word = idea.slice(0, 6)

  const chapters: OutlineChapter[] = Array.from({ length: chapterCount }, (_, i) => {
    const no = i + 1
    // 标题从词库循环取，保证同风格内标题风格统一且不重复感过强
    const titlePart = tpl.titleParts[i % tpl.titleParts.length]
    const pattern = tpl.summaryPatterns[i % tpl.summaryPatterns.length]
    return {
      no,
      title: `第${no}章 ${titlePart}`,
      summary: pattern.replace('{idea}', idea).replace('{word}', word),
    }
  })

  return {
    title: `${idea}（${styleName(styleKey)}）`,
    logline: tpl.loglinePattern.replace('{idea}', idea),
    theme: tpl.theme,
    chapters,
  }
}

function styleName(key: StyleKey): string {
  const names: Record<StyleKey, string> = {
    xuanhuan: '玄幻卷',
    dushi: '都市卷',
    scifi: '科幻卷',
    wuxia: '武侠卷',
    default: '故事卷',
  }
  return names[key]
}
