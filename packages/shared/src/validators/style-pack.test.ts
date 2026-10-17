import { describe, expect, it } from 'vitest'
import { validateStylePackContent } from './style-pack'

describe('validateStylePackContent', () => {
  it('promptGuidance 非字符串 → 拒', () => {
    const errors = validateStylePackContent({
      promptGuidance: 123,
      vocabPreferences: ['凝练'],
    })
    expect(errors).toContain('promptGuidance 必须是字符串')
  })

  it('vocabPreferences 含非字符串项 → 拒', () => {
    const errors = validateStylePackContent({
      promptGuidance: '冷峻克制的叙事',
      vocabPreferences: ['凝练', 42, '留白'],
    })
    expect(errors).toContain('vocabPreferences 必须是字符串数组')
  })

  it('vocabPreferences 非数组 → 拒', () => {
    const errors = validateStylePackContent({
      promptGuidance: '冷峻克制的叙事',
      vocabPreferences: '凝练',
    })
    expect(errors).toContain('vocabPreferences 必须是字符串数组')
  })

  it('字段缺失 → 拒', () => {
    const errors = validateStylePackContent({})
    expect(errors).toContain('promptGuidance 必须是字符串')
    expect(errors).toContain('vocabPreferences 必须是字符串数组')
  })

  it('content 非对象（null/数组/字符串）→ 拒', () => {
    expect(validateStylePackContent(null)).toContain('content 必须是对象')
    expect(validateStylePackContent([])).toContain('content 必须是对象')
    expect(validateStylePackContent('xxx')).toContain('content 必须是对象')
  })

  it('合法 content → 过（空错误列表）', () => {
    const errors = validateStylePackContent({
      styleSummary: '都市悬疑风',
      promptGuidance: '冷峻克制的叙事',
      vocabPreferences: ['凝练', '留白'],
      sampleSentences: ['例句'],
    })
    expect(errors).toEqual([])
  })

  it('多余字段不校验（只强制两个字段）', () => {
    const errors = validateStylePackContent({
      promptGuidance: '冷峻克制的叙事',
      vocabPreferences: [],
      unknownField: { any: 'value' },
    })
    expect(errors).toEqual([])
  })
})
