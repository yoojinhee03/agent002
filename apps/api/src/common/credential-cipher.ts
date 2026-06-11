import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

/**
 * Phase 10-3: 사용자 자격증명(`UserCredential.valueEnc`) 전용 AES-256-GCM 암호화 유틸.
 *
 * 키 우선순위:
 *   1) `CREDENTIAL_ENCRYPTION_KEY` (32 bytes hex / 64 chars)
 *   2) `ENCRYPTION_KEY` (provider/api-key 와 동일 키 fallback — 단일 운영 환경 편의)
 *
 * 키 발급:
 *   $ openssl rand -hex 32
 *
 * 인코딩: base64(iv(12B) || authTag(16B) || ciphertext)
 */

function getKey(): Buffer {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || ''
  const key = Buffer.from(raw, 'hex')
  if (key.length !== 32) {
    throw new Error(
      'CREDENTIAL_ENCRYPTION_KEY (or ENCRYPTION_KEY fallback) must be 32 bytes hex (64 hex chars)',
    )
  }
  return key
}

export function encryptCredential(plain: string): string {
  if (typeof plain !== 'string') {
    throw new TypeError('encryptCredential expects string input')
  }
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptCredential(cipherText: string): string {
  const raw = Buffer.from(cipherText, 'base64')
  if (raw.length < 28) {
    throw new Error('decryptCredential: ciphertext too short')
  }
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const enc = raw.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(enc), decipher.final()])
  return dec.toString('utf8')
}

/**
 * 평문 자격증명을 사용자 표시용으로 마스킹.
 * - 길이 ≤ 8: `****`
 * - 그 외: `xxxx****yyyy` (앞 4 + 뒤 4)
 */
export function maskCredentialValue(plain: string): string {
  if (!plain || plain.length <= 8) return '****'
  return `${plain.slice(0, 4)}****${plain.slice(-4)}`
}

export function lastFourOf(plain: string): string {
  return plain && plain.length >= 4 ? plain.slice(-4) : ''
}
