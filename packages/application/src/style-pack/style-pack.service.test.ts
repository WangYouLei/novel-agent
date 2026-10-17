import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BizError, ErrorCode, type StylePackContent } from '@novelagent/shared'
import { createTestDb, type TestDb } from '../test-support/test-db'
import { StylePackService } from './style-pack.service'

const validContent: StylePackContent = {
  styleSummary: '都市悬疑风',
  promptGuidance: '冷峻克制的叙事，多用短句制造压迫感',
  vocabPreferences: ['凝练', '留白'],
  sampleSentences: ['夜色像一张收紧的网。'],
}

describe('StylePackService content 校验', () => {
  let db: TestDb
  let service: StylePackService
  let userId: string

  beforeAll(async () => {
    db = await createTestDb()
    service = new StylePackService(db.client)
    const user = await db.client.user.create({ data: { username: 'stylist' } })
    userId = user.id
  })

  afterAll(async () => {
    await db.cleanup()
  })

  it('createGenerated 传非法 content（promptGuidance 非字符串）→ BizError(BAD_REQUEST)', async () => {
    const invalid = { ...validContent, promptGuidance: 123 } as unknown as StylePackContent
    await expect(
      service.createGenerated(userId, '坏风格包', invalid, 'style-generator'),
    ).rejects.toMatchObject({ code: ErrorCode.BAD_REQUEST, name: 'BizError' })
  })

  it('createGenerated 传非法 content（vocabPreferences 含非字符串项）→ BizError(BAD_REQUEST)', async () => {
    const invalid = { ...validContent, vocabPreferences: ['凝练', 42] } as unknown as StylePackContent
    await expect(
      service.createGenerated(userId, '坏风格包', invalid, 'style-generator'),
    ).rejects.toMatchObject({ code: ErrorCode.BAD_REQUEST })
  })

  it('createGenerated 传合法 content → 入库成功', async () => {
    const pack = await service.createGenerated(userId, '好风格包', validContent, 'style-generator')
    expect(pack.id).toBeTruthy()
    expect(pack.content.promptGuidance).toBe(validContent.promptGuidance)
  })

  it('update 传非法 content → BizError(BAD_REQUEST)', async () => {
    const pack = await service.createGenerated(userId, '待更新', validContent, 'style-generator')
    const invalid = { ...validContent, vocabPreferences: '凝练' } as unknown as StylePackContent
    await expect(
      service.update(userId, pack.id, { content: invalid }),
    ).rejects.toBeInstanceOf(BizError)
    await expect(service.update(userId, pack.id, { content: invalid })).rejects.toMatchObject({
      code: ErrorCode.BAD_REQUEST,
    })
  })

  it('update 传合法 content → 更新成功', async () => {
    const pack = await service.createGenerated(userId, '待更新2', validContent, 'style-generator')
    const next = { ...validContent, promptGuidance: '更明快的叙事节奏' }
    const updated = await service.update(userId, pack.id, { content: next })
    expect(updated.content.promptGuidance).toBe('更明快的叙事节奏')
  })
})
