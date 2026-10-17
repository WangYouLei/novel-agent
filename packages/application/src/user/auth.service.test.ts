import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CREDIT_POLICY, ErrorCode } from '@novelagent/shared'
import type { AppConfig } from '../config'
import { createTestDb, type TestDb } from '../test-support/test-db'
import { AuthService } from './auth.service'

/** 测试专用配置：字面量构造，不触发 loadAppConfig（避免读写仓库 data/ 目录） */
const testConfig: AppConfig = {
  dataRoot: '',
  databaseUrl: '',
  jwtSecret: 'test-jwt-secret',
  apiCryptoKey: Buffer.alloc(32),
  port: 3000,
}

describe('AuthService', () => {
  let db: TestDb
  let service: AuthService

  beforeAll(async () => {
    db = await createTestDb()
    service = new AuthService(db.client, testConfig)
  })

  afterAll(async () => {
    await db.cleanup()
  })

  describe('register', () => {
    it('注册成功：用户与注册赠送流水同时落库（事务完整性）', async () => {
      const user = await service.register('alice', 'password123')
      expect(user.username).toBe('alice')
      expect(user.credits).toBe(CREDIT_POLICY.REGISTER_BONUS)

      const logs = await db.client.creditLog.findMany({ where: { userId: user.id } })
      expect(logs).toHaveLength(1)
      expect(logs[0].amount).toBe(CREDIT_POLICY.REGISTER_BONUS)
      expect(logs[0].type).toBe('ADMIN_ADJUST')
      expect(logs[0].description).toBe('注册赠送')
    })

    it('同用户名重复注册 → USERNAME_TAKEN（唯一约束 P2002 转译）', async () => {
      await expect(service.register('alice', 'password456')).rejects.toMatchObject({
        code: ErrorCode.USERNAME_TAKEN,
      })
      // 重复注册不得产生新的用户或流水
      expect(await db.client.user.count({ where: { username: 'alice' } })).toBe(1)
    })
  })

  describe('claimDaily', () => {
    it('从未领取过（lastDailyClaim=null）首次领取成功（验证 null 分支）', async () => {
      const user = await db.client.user.create({
        data: { username: 'bob', credits: 0, lastDailyClaim: null },
      })
      const result = await service.claimDaily(user.id)
      expect(result.claimed).toBe(CREDIT_POLICY.DAILY_CLAIM_AMOUNT)
      expect(result.credits).toBe(CREDIT_POLICY.DAILY_CLAIM_AMOUNT)

      const after = await db.client.user.findUniqueOrThrow({ where: { id: user.id } })
      expect(after.lastDailyClaim).not.toBeNull()
      const logs = await db.client.creditLog.findMany({
        where: { userId: user.id, type: 'DAILY_GIFT' },
      })
      expect(logs).toHaveLength(1)
    })

    it('同一用户当天第二次领取 → DAILY_ALREADY_CLAIMED，余额与流水不变', async () => {
      const user = await db.client.user.create({
        data: { username: 'carol', credits: 0, lastDailyClaim: null },
      })
      const first = await service.claimDaily(user.id)
      expect(first.credits).toBe(CREDIT_POLICY.DAILY_CLAIM_AMOUNT)

      await expect(service.claimDaily(user.id)).rejects.toMatchObject({
        code: ErrorCode.DAILY_ALREADY_CLAIMED,
      })

      const after = await db.client.user.findUniqueOrThrow({ where: { id: user.id } })
      expect(after.credits).toBe(CREDIT_POLICY.DAILY_CLAIM_AMOUNT)
      expect(after.lastDailyClaim).not.toBeNull()
      const logs = await db.client.creditLog.findMany({
        where: { userId: user.id, type: 'DAILY_GIFT' },
      })
      expect(logs).toHaveLength(1)
    })
  })
})
