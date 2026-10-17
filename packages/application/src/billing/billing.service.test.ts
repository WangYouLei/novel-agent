import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ErrorCode } from '@novelagent/shared'
import { createTestDb, type TestDb } from '../test-support/test-db'
import { BillingService } from './billing.service'

describe('BillingService.chargeForModelCall', () => {
  let db: TestDb
  let service: BillingService

  beforeAll(async () => {
    db = await createTestDb()
    service = new BillingService(db.client)
  })

  afterAll(async () => {
    await db.cleanup()
  })

  it('余额 60 扣 50：成功，余额变 10 且写入流水', async () => {
    const user = await db.client.user.create({ data: { username: 'rich', credits: 60 } })
    const logId = await service.chargeForModelCall({
      userId: user.id,
      amount: 50,
      description: '测试扣费',
    })
    expect(logId).toBeTruthy()

    const after = await db.client.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(after.credits).toBe(10)

    const logs = await db.client.creditLog.findMany({ where: { userId: user.id } })
    expect(logs).toHaveLength(1)
    expect(logs[0].amount).toBe(-50)
    expect(logs[0].type).toBe('MODEL_CALL')
  })

  it('余额 10 再扣 50 → INSUFFICIENT_CREDITS，余额仍为 10 且无新流水', async () => {
    const user = await db.client.user.create({ data: { username: 'poor', credits: 60 } })
    await service.chargeForModelCall({ userId: user.id, amount: 50, description: '首次扣费' })
    // 此时余额 10，再扣 50 应因条件更新不命中而失败
    await expect(
      service.chargeForModelCall({ userId: user.id, amount: 50, description: '二次扣费' }),
    ).rejects.toMatchObject({ code: ErrorCode.INSUFFICIENT_CREDITS })

    const after = await db.client.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(after.credits).toBe(10)
    const logs = await db.client.creditLog.findMany({ where: { userId: user.id } })
    expect(logs).toHaveLength(1)
  })

  it('用户不存在 → NOT_FOUND', async () => {
    await expect(
      service.chargeForModelCall({ userId: 'no-such-user', amount: 50, description: '不存在用户' }),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND })
  })
})
