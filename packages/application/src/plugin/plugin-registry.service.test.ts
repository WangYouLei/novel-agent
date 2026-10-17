import { describe, expect, it } from 'vitest'
import { BizError, ErrorCode, type PluginConfigField } from '@novelagent/shared'
import { validatePluginConfig } from './plugin-registry.service'

/** 覆盖全部字段类型的测试 schema（形态对齐 outline-generator 的 configSchema） */
const schema: PluginConfigField[] = [
  { key: 'chapterCount', name: '章节数量', type: 'number', default: 20, min: 5, max: 10 },
  {
    key: 'plotTwistFrequency',
    name: '剧情转折频率',
    type: 'string',
    default: 'medium',
    enum: ['low', 'medium', 'high'],
  },
  { key: 'includeForeshadowing', name: '包含伏笔设计', type: 'boolean', default: true },
  { key: 'style', name: '风格', type: 'select', enum: ['xuanhuan', 'dushi'] },
]

/** 断言校验失败且为 BAD_REQUEST 业务错误 */
function expectReject(values: Record<string, unknown>): void {
  let caught: unknown
  try {
    validatePluginConfig(schema, values)
  } catch (err) {
    caught = err
  }
  expect(caught).toBeInstanceOf(BizError)
  expect((caught as BizError).code).toBe(ErrorCode.BAD_REQUEST)
}

describe('validatePluginConfig', () => {
  it('number 传字符串数字 "abc" → 拒', () => {
    expectReject({ chapterCount: 'abc' })
  })

  it('number 传 "5"（合法数字的字符串形式）→ 拒', () => {
    expectReject({ chapterCount: '5' })
  })

  it('number 传 NaN / Infinity → 拒', () => {
    expectReject({ chapterCount: Number.NaN })
    expectReject({ chapterCount: Number.POSITIVE_INFINITY })
  })

  it('number 传合法值 → 过', () => {
    expect(() => validatePluginConfig(schema, { chapterCount: 7 })).not.toThrow()
  })

  it('number 小于 min / 大于 max → 拒', () => {
    expectReject({ chapterCount: 4 })
    expectReject({ chapterCount: 11 })
  })

  it('number 恰在 min/max 边界 → 过', () => {
    expect(() => validatePluginConfig(schema, { chapterCount: 5 })).not.toThrow()
    expect(() => validatePluginConfig(schema, { chapterCount: 10 })).not.toThrow()
  })

  it('string 传数字 → 拒', () => {
    expectReject({ plotTwistFrequency: 123 })
  })

  it('string 声明了 enum 时传非枚举值 → 拒', () => {
    expectReject({ plotTwistFrequency: 'ultra' })
  })

  it('boolean 传 "true" 字符串 → 拒', () => {
    expectReject({ includeForeshadowing: 'true' })
  })

  it('boolean 传 0 → 拒', () => {
    expectReject({ includeForeshadowing: 0 })
  })

  it('select 传非枚举值 → 拒', () => {
    expectReject({ style: 'wuxia' })
  })

  it('合法配置整体 → 过', () => {
    expect(() =>
      validatePluginConfig(schema, {
        chapterCount: 8,
        plotTwistFrequency: 'high',
        includeForeshadowing: false,
        style: 'dushi',
      }),
    ).not.toThrow()
  })

  it('未提供（null/undefined）的字段跳过校验，schema 外的未知字段原样保留不校验', () => {
    expect(() =>
      validatePluginConfig(schema, { chapterCount: null, unknownKey: '任意值' }),
    ).not.toThrow()
  })
})
