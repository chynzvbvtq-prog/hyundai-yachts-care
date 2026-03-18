import { Context, Next } from 'hono'
import { Env, JWTPayload } from '../types'

// ──────────────────────────────────────────────────────────────────────────────
// Base64url 유틸
// ──────────────────────────────────────────────────────────────────────────────
function base64urlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  bytes.forEach(b => binary += String.fromCharCode(b))
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function base64urlDecode(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - str.length % 4) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

// ──────────────────────────────────────────────────────────────────────────────
// JWT (HS256, Web Crypto API)
// ──────────────────────────────────────────────────────────────────────────────
export async function createJWT(payload: object, secret: string): Promise<string> {
  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const encodedPayload = base64urlEncode(JSON.stringify(payload))
  const data = `${header}.${encodedPayload}`

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${data}.${sig}`
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [header, payload, sig] = parts
    const data = `${header}.${payload}`

    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    )
    const sigBuffer = Uint8Array.from(
      atob(sig.replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0)
    )
    const valid = await crypto.subtle.verify('HMAC', key, sigBuffer, encoder.encode(data))
    if (!valid) return null

    const decodedPayload = JSON.parse(base64urlDecode(payload)) as JWTPayload

    // exp 만료 검사
    if (decodedPayload.exp && decodedPayload.exp < Math.floor(Date.now() / 1000)) {
      return null
    }

    return decodedPayload
  } catch {
    return null
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 비밀번호 해시 – PBKDF2 (Web Crypto API, 100,000 iterations / SHA-256)
// 저장 형식: "pbkdf2$<iterations>$<salt_hex>$<hash_hex>"
// ──────────────────────────────────────────────────────────────────────────────
const PBKDF2_ITERATIONS = 100_000
const PBKDF2_ALGO       = { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: new Uint8Array(0) }

function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}
function hexToBuf(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

export async function hashPassword(password: string): Promise<string> {
  // 랜덤 16 byte salt
  const saltBuf = crypto.getRandomValues(new Uint8Array(16))
  const saltHex = bufToHex(saltBuf.buffer)

  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBuf, iterations: PBKDF2_ITERATIONS },
    keyMaterial, 256
  )
  const hashHex = bufToHex(derived)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // 레거시 SHA-256 해시 지원 (마이그레이션 전 계정)
  if (!stored.startsWith('pbkdf2$')) {
    const encoder = new TextEncoder()
    const data = encoder.encode(password + 'hyundaiyacht_salt_2024')
    const hash = await crypto.subtle.digest('SHA-256', data)
    const legacy = btoa(String.fromCharCode(...new Uint8Array(hash)))
    return legacy === stored
  }

  const [, itersStr, saltHex, storedHash] = stored.split('$')
  const iterations = parseInt(itersStr, 10)
  const salt = hexToBuf(saltHex)

  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial, 256
  )
  return bufToHex(derived) === storedHash
}

// ──────────────────────────────────────────────────────────────────────────────
// 인증 미들웨어
// requiredRole: 'admin' → DB에서 실제 역할 재확인
// ──────────────────────────────────────────────────────────────────────────────
export function authMiddleware(requiredRole?: string) {
  return async (c: Context<{ Bindings: Env; Variables: { user: any } }>, next: Next) => {
    const authHeader   = c.req.header('Authorization')
    const cookieHeader = c.req.header('Cookie')

    let token = ''
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7)
    } else if (cookieHeader) {
      const m = cookieHeader.match(/token=([^;]+)/)
      if (m) token = m[1]
    }

    if (!token) return c.json({ error: '인증이 필요합니다.' }, 401)

    const secret  = c.env.JWT_SECRET || 'hyundai_yacht_care_secret_2024'
    const payload = await verifyJWT(token, secret)
    if (!payload) return c.json({ error: '유효하지 않은 토큰입니다.' }, 401)

    // [A-7] 관리자 라우트: DB에서 실제 role 재검증
    if (requiredRole === 'admin') {
      const dbUser = await c.env.DB.prepare(
        'SELECT id, role FROM users WHERE id = ?'
      ).bind(payload.userId).first() as { id: number; role: string } | null

      if (!dbUser) return c.json({ error: '사용자를 찾을 수 없습니다.' }, 401)
      if (dbUser.role !== 'admin') return c.json({ error: '관리자 권한이 필요합니다.' }, 403)

      c.set('user', { ...payload, role: dbUser.role })
      await next()
      return
    }

    // 일반 역할 검증 (토큰 내 role 사용)
    if (requiredRole && payload.role !== requiredRole && payload.role !== 'admin') {
      return c.json({ error: '권한이 없습니다.' }, 403)
    }

    c.set('user', payload)
    await next()
  }
}
