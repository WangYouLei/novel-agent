import type { StylePackContent } from '@novelagent/shared'

/**
 * 内置风格包数据（PRD 6.2：MVP 需 3-5 个内置风格包，保证任何功能都有兜底风格可用）
 * 各包风格差异明显，用于验证验收标准 6（不同风格包生成的大纲风格有明显差异）
 */
export interface BuiltinStylePackDef {
  builtinKey: string
  name: string
  description: string
  content: StylePackContent
}

export const BUILTIN_STYLE_PACKS: BuiltinStylePackDef[] = [
  {
    builtinKey: 'xuanhuan',
    name: '东方玄幻',
    description: '宏大世界观、修炼体系、热血成长',
    content: {
      styleSummary: '东方玄幻：宏大世界观，修炼体系层层递进，热血激昂',
      promptGuidance:
        '以东方玄幻风格创作：世界观宏大且自洽，构建清晰的修炼境界体系；多用气势磅礴的意象（苍穹、雷劫、上古、大能、洞天福地）；情节强调逆天改命、机缘造化与热血成长；语言凝练有力，张弛有度。',
      vocabPreferences: ['灵气', '境界', '洞天', '大能', '机缘', '大道', '雷劫', '逆天改命'],
      sampleSentences: [
        '九霄雷云翻涌，少年立于断崖之上，体内金丹缓缓流转。',
        '这一夜，青冥大陆亿万生灵齐齐望向天穹——有大道之音，自虚空深处传来。',
      ],
    },
  },
  {
    builtinKey: 'dushi',
    name: '都市现实',
    description: '现代都市、写实节奏、人情冷暖',
    content: {
      styleSummary: '都市现实：现代都市背景，节奏写实，聚焦人情冷暖与市井烟火',
      promptGuidance:
        '以都市现实风格创作：背景立足当代城市生活，细节真实可信（写字楼、地铁、老小区、深夜食堂）；情节围绕职场、情感、家庭与阶层展开；语言平实克制、对白生活化，情感表达含蓄而有后劲。',
      vocabPreferences: ['写字楼', '地铁末班车', '老城区', '房租', '深夜食堂', '体检报告'],
      sampleSentences: [
        '晚高峰的地铁里，她攥着手机，屏幕上那条消息看了三遍，还是没敢回复。',
        '凌晨两点的写字楼，只剩他工位的灯还亮着。',
      ],
    },
  },
  {
    builtinKey: 'scifi',
    name: '硬核科幻',
    description: '科技设定、理性思辨、文明尺度',
    content: {
      styleSummary: '硬核科幻：以科技设定为骨，理性思辨为魂，尺度放到文明与星辰',
      promptGuidance:
        '以硬核科幻风格创作：设定遵循已知科学逻辑并自洽推演（轨道、熵、算力、基因、光速壁垒）；多用精确的技术意象与量化描述；情节强调文明尺度上的抉择与思辨；语言冷静、克制、准确，避免玄幻化表达。',
      vocabPreferences: ['轨道', '熵增', '算力', '冬眠舱', '拉格朗日点', '光速壁垒', '奇点'],
      sampleSentences: [
        '飞船在拉格朗日点静静悬浮了七十年，直到地球方向的通讯频段再次亮起。',
        '按照推演，文明的窗口期还剩四百年——误差不超过百分之三。',
      ],
    },
  },
  {
    builtinKey: 'wuxia',
    name: '传统武侠',
    description: '江湖恩怨、古典意趣、侠义精神',
    content: {
      styleSummary: '传统武侠：江湖庙堂，恩怨情仇，古典意趣与侠义精神',
      promptGuidance:
        '以传统武侠风格创作：构建门派、江湖规矩与恩怨脉络；多用古典意象（孤舟、残剑、客栈、烟雨、大漠）；情节强调侠义抉择与快意恩仇；语言带古意而不晦涩，招式描写重意不重形。',
      vocabPreferences: ['江湖', '恩怨', '客栈', '残剑', '掌门', '快意恩仇', '烟雨'],
      sampleSentences: [
        '三月初三，烟雨渡口，一叶孤舟载着个背剑的年轻人靠了岸。',
        '老人把酒碗推过去："这一碗，敬三十年前死在雁门关外的故人。"',
      ],
    },
  },
]
