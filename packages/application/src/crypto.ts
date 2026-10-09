import crypto from 'node:crypto'

/**
 * API Key 加密存储（文档待确认项"API Key 加密方案"的落地：AES-256-GCM）
 * 密钥为 32 字节随机数，首次启动生成于 DATA_ROOT/crypto.key（见 config.ts）
 *
 * 密文格式：base64(iv, 12字节) + '.' + base64(authTag, 16字节) + '.' + base64(ciphertext)
 */
export function encryptWithKey(key: Buffer, plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`
}

export function decryptWithKey(key: Buffer, payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.')
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('非法的加密数据格式')
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ])
  return decrypted.toString('utf-8')
}
