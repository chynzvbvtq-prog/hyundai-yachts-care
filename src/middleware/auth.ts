import { Context, Next } from 'hono'
import { Env, JWTPayload } from '../types'

// Unicode-safe base64url encode
function base64urlEncode(str: string): string {
  // Convert to UTF-8 bytes then base64
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

// 간단한 JWT 구현 (Web Crypto API 사용)
async function createJWT(payload: object, secret: string): Promise<string> {
  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const encodedPayload = base64urlEncode(JSON.stringify(payload))
  const data = `${header}.${encodedPayload}`
  
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  
  return `${data}.${sig}`
}

async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    
    const [header, payload, sig] = parts
    const data = `${header}.${payload}`
    
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    
    const sigBuffer = Uint8Array.from(
      atob(sig.replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0)
    )
    
    const valid = await crypto.subtle.verify('HMAC', key, sigBuffer, encoder.encode(data))
    if (!valid) return null
    
    const decodedPayload = JSON.parse(base64urlDecode(payload)) as JWTPayload
    if (decodedPayload.exp < Date.now() / 1000) return null
    
    return decodedPayload
  } catch {
    return null
  }
}

// 비밀번호 해시 (단순한 방식, 실제 프로덕션에서는 bcrypt 권장)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + 'hyundaiyacht_salt_2024')
  const hash = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const computed = await hashPassword(password)
  return computed === hash
}

export { createJWT, verifyJWT, hashPassword, verifyPassword }

export function authMiddleware(requiredRole?: string) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const authHeader = c.req.header('Authorization')
    const cookieHeader = c.req.header('Cookie')
    
    let token = ''
    
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7)
    } else if (cookieHeader) {
      const tokenMatch = cookieHeader.match(/token=([^;]+)/)
      if (tokenMatch) token = tokenMatch[1]
    }
    
    if (!token) {
      return c.json({ error: '인증이 필요합니다.' }, 401)
    }
    
    const secret = c.env.JWT_SECRET || 'hyundai_yacht_care_secret_2024'
    const payload = await verifyJWT(token, secret)
    
    if (!payload) {
      return c.json({ error: '유효하지 않은 토큰입니다.' }, 401)
    }
    
    if (requiredRole && payload.role !== requiredRole && payload.role !== 'admin') {
      return c.json({ error: '권한이 없습니다.' }, 403)
    }
    
    c.set('user', payload)
    await next()
  }
}
