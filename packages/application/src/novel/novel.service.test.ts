import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ErrorCode } from '@novelagent/shared'
import { createTestDb, type TestDb } from '../test-support/test-db'
import { NovelService } from './novel.service'

/**
 * 风格包归属校验测试（批次 2，评审 H6）：
 * 共享包（userId=null）任何人可用；私人包仅归属者可用，他人引用 → STYLE_PACK_NOT_FOUND
 */

describe('NovelService 风格包归属校验（评审 H6）', () => {
  let db: TestDb
  let service: NovelService
  let userAId: string
  let userBId: string
  let sharedPackId: string
  let privatePackAId: string

  beforeAll(async () => {
    db = await createTestDb()
    service = new NovelService(db.client)

    const userA = await db.client.user.create({ data: { username: 'user-a' } })
    const userB = await db.client.user.create({ data: { username: 'user-b' } })
    userAId = userA.id
    userBId = userB.id

    // 共享包：无归属（userId 为 null），任何人可用
    const shared = await db.client.stylePack.create({
      data: { name: '共享风格包', sourceType: 'BUILTIN', content: {} },
    })
    sharedPackId = shared.id

    // 用户 A 的私人包
    const privateA = await db.client.stylePack.create({
      data: { name: 'A的私人包', sourceType: 'USER_GENERATED', content: {}, userId: userAId },
    })
    privatePackAId = privateA.id
  })

  afterAll(async () => {
    await db.cleanup()
  })

  it('引用自己的私人风格包 → 通过', async () => {
    const novel = await service.create(userAId, { title: '小说一', stylePackId: privatePackAId })
    expect(novel.stylePackId).toBe(privatePackAId)
    expect(novel.stylePackName).toBe('A的私人包')
  })

  it('引用他人（用户 B）的私人风格包 → STYLE_PACK_NOT_FOUND（不泄露他人风格包存在性）', async () => {
    const bPack = await db.client.stylePack.create({
      data: { name: 'B的私人包', sourceType: 'USER_GENERATED', content: {}, userId: userBId },
    })
    await expect(
      service.create(userAId, { title: '越权小说', stylePackId: bPack.id }),
    ).rejects.toMatchObject({ code: ErrorCode.STYLE_PACK_NOT_FOUND })
    // 归属者本人引用正常
    const novel = await service.create(userBId, { title: 'B的小说', stylePackId: bPack.id })
    expect(novel.stylePackId).toBe(bPack.id)
  })

  it('引用共享风格包（userId=null）→ 通过', async () => {
    const novel = await service.create(userAId, { title: '小说二', stylePackId: sharedPackId })
    expect(novel.stylePackId).toBe(sharedPackId)
  })

  it('update 变更风格包时同样校验归属', async () => {
    const novel = await service.create(userAId, { title: '小说三' })
    const bPack = await db.client.stylePack.create({
      data: { name: 'B的另一个包', sourceType: 'USER_GENERATED', content: {}, userId: userBId },
    })
    await expect(
      service.update(userAId, novel.id, { stylePackId: bPack.id }),
    ).rejects.toMatchObject({ code: ErrorCode.STYLE_PACK_NOT_FOUND })

    // 换成自己的私人包成功
    const updated = await service.update(userAId, novel.id, { stylePackId: privatePackAId })
    expect(updated.stylePackId).toBe(privatePackAId)
  })

  it('不存在的风格包 → STYLE_PACK_NOT_FOUND（原语义保持）', async () => {
    await expect(
      service.create(userAId, { title: '小说四', stylePackId: 'no-such-pack' }),
    ).rejects.toMatchObject({ code: ErrorCode.STYLE_PACK_NOT_FOUND })
  })
})
