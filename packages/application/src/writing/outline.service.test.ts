import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { OutlineStructure } from '@novelagent/shared'
import { createTestDb, type TestDb } from '../test-support/test-db'
import { OutlineService } from './outline.service'

const structure: OutlineStructure = {
  title: '测试小说',
  logline: '一句话故事',
  theme: '成长',
  chapters: [{ no: 1, title: '第一章', summary: '开篇' }],
}

describe('OutlineService.save', () => {
  let db: TestDb
  let service: OutlineService
  let userId: string
  let novelId: string

  beforeAll(async () => {
    db = await createTestDb()
    service = new OutlineService(db.client)
    const user = await db.client.user.create({ data: { username: 'writer' } })
    userId = user.id
    const novel = await db.client.novel.create({ data: { userId, title: '测试小说' } })
    novelId = novel.id
  })

  afterAll(async () => {
    await db.cleanup()
  })

  it('同一小说连续保存两次：version 分别为 1、2，且仅最新版本 active', async () => {
    const first = await service.save(userId, novelId, structure)
    expect(first.version).toBe(1)
    expect(first.isActive).toBe(true)

    const second = await service.save(userId, novelId, structure)
    expect(second.version).toBe(2)
    expect(second.isActive).toBe(true)

    // 旧版本已被置为 inactive
    const firstAfter = await db.client.outline.findUniqueOrThrow({ where: { id: first.id } })
    expect(firstAfter.isActive).toBe(false)
  })

  it('手工插入重复 (novelId, version) 违反唯一约束（P2002）', async () => {
    // 上一个用例已产生 (novelId, version=2)，直接重复插入应被唯一索引拒绝
    await expect(
      db.client.outline.create({
        data: { novelId, version: 2, isActive: false, structure: structure as never },
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })
})
