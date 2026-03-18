import { Hono } from 'hono'
import { Env } from '../types'
import { createJWT, hashPassword, verifyPassword, verifyJWT } from '../middleware/auth'

const authRoutes = new Hono<{ Bindings: Env }>()

// ── 공통 입력값 정규식 ──
const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/   // 영문+숫자 조합 8~72자

// ── JWT 만료 상수 ──
const ACCESS_TTL  = 24 * 60 * 60       // 24시간 (초)
const REFRESH_TTL = 7 * 24 * 60 * 60  // 7일  (초)

// ──────────────────────────────────────────────────────────
// POST /api/auth/login
// ──────────────────────────────────────────────────────────
authRoutes.post('/login', async (c) => {
  try {
    const body = await c.req.json().catch(() => null)
    if (!body) return c.json({ error: '요청 본문이 유효하지 않습니다.' }, 400)

    const { email, password } = body

    // [B-3] 입력값 검증
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return c.json({ error: '유효한 이메일을 입력해주세요.' }, 400)
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return c.json({ error: '비밀번호를 입력해주세요.' }, 400)
    }

    const user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(email.trim().toLowerCase()).first() as any

    if (!user) {
      return c.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
    }

    const passwordValid = await verifyPassword(password, user.password_hash as string)
    if (!passwordValid) {
      return c.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
    }

    const secret = c.env.JWT_SECRET || 'hyundai_yacht_care_secret_2024'
    const now    = Math.floor(Date.now() / 1000)

    // Access Token – 24시간
    const token = await createJWT({
      userId: user.id,
      email:  user.email,
      role:   user.role,
      name:   user.name,
      iat:    now,
      exp:    now + ACCESS_TTL
    }, secret)

    // Refresh Token – 7일
    const refreshToken = await createJWT({
      userId: user.id,
      type:   'refresh',
      iat:    now,
      exp:    now + REFRESH_TTL
    }, secret)

    return c.json({
      success: true,
      token,
      refresh_token: refreshToken,
      expires_in: ACCESS_TTL,
      user: {
        id:              user.id,
        email:           user.email,
        name:            user.name,
        role:            user.role,
        membership_type: user.membership_type,
        yacht_name:      user.yacht_name
      }
    })
  } catch (e) {
    console.error('Login error:', e)
    return c.json({ error: '로그인 중 오류가 발생했습니다.' }, 500)
  }
})

// ──────────────────────────────────────────────────────────
// POST /api/auth/register
// ──────────────────────────────────────────────────────────
authRoutes.post('/register', async (c) => {
  try {
    const body = await c.req.json().catch(() => null)
    if (!body) return c.json({ error: '요청 본문이 유효하지 않습니다.' }, 400)

    const { email, password, name, phone, yacht_name, yacht_model, yacht_length, marina_berth } = body

    // [B-3] 입력값 검증
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return c.json({ error: '유효한 이메일을 입력해주세요.' }, 400)
    }
    if (!password || typeof password !== 'string' || !PASSWORD_RE.test(password)) {
      return c.json({ error: '비밀번호는 영문+숫자 조합 8자 이상이어야 합니다.' }, 400)
    }
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return c.json({ error: '이름은 2자 이상 입력해주세요.' }, 400)
    }
    if (phone && typeof phone === 'string' && phone.trim()) {
      const cleaned = phone.replace(/[^0-9]/g, '')
      if (cleaned.length < 10 || cleaned.length > 11) {
        return c.json({ error: '연락처 형식이 올바르지 않습니다.' }, 400)
      }
    }

    // 이메일 중복 확인
    const existing = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email.trim().toLowerCase()).first()
    if (existing) return c.json({ error: '이미 등록된 이메일입니다.' }, 409)

    // [B-1] PBKDF2 해시
    const passwordHash = await hashPassword(password)

    const result = await c.env.DB.prepare(`
      INSERT INTO users (email, password_hash, name, phone, yacht_name, yacht_model, yacht_length, marina_berth)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      email.trim().toLowerCase(), passwordHash, name.trim(),
      phone || null, yacht_name || null, yacht_model || null,
      yacht_length || null, marina_berth || null
    ).run()

    const secret = c.env.JWT_SECRET || 'hyundai_yacht_care_secret_2024'
    const now    = Math.floor(Date.now() / 1000)

    const token = await createJWT({
      userId: result.meta.last_row_id,
      email:  email.trim().toLowerCase(),
      role:   'customer',
      name:   name.trim(),
      iat:    now,
      exp:    now + ACCESS_TTL
    }, secret)

    const refreshToken = await createJWT({
      userId: result.meta.last_row_id,
      type:   'refresh',
      iat:    now,
      exp:    now + REFRESH_TTL
    }, secret)

    return c.json({
      success:       true,
      token,
      refresh_token: refreshToken,
      expires_in:    ACCESS_TTL,
      user: {
        id:              result.meta.last_row_id,
        email:           email.trim().toLowerCase(),
        name:            name.trim(),
        role:            'customer',
        membership_type: 'standard'
      }
    })
  } catch (e) {
    console.error('Register error:', e)
    return c.json({ error: '회원가입 중 오류가 발생했습니다.' }, 500)
  }
})

// ──────────────────────────────────────────────────────────
// POST /api/auth/refresh  – Refresh Token으로 Access Token 재발급
// ──────────────────────────────────────────────────────────
authRoutes.post('/refresh', async (c) => {
  try {
    const body = await c.req.json().catch(() => null)
    const refreshToken = body?.refresh_token
    if (!refreshToken) return c.json({ error: 'refresh_token이 필요합니다.' }, 400)

    const secret  = c.env.JWT_SECRET || 'hyundai_yacht_care_secret_2024'
    const payload = await verifyJWT(refreshToken, secret) as any
    if (!payload || payload.type !== 'refresh') {
      return c.json({ error: '유효하지 않은 refresh token입니다.' }, 401)
    }

    // DB에서 사용자 상태 재확인
    const user = await c.env.DB.prepare(
      'SELECT id, email, name, role, membership_type, yacht_name FROM users WHERE id = ?'
    ).bind(payload.userId).first() as any
    if (!user) return c.json({ error: '사용자를 찾을 수 없습니다.' }, 401)

    const now = Math.floor(Date.now() / 1000)

    const newToken = await createJWT({
      userId: user.id,
      email:  user.email,
      role:   user.role,
      name:   user.name,
      iat:    now,
      exp:    now + ACCESS_TTL
    }, secret)

    return c.json({
      success:    true,
      token:      newToken,
      expires_in: ACCESS_TTL
    })
  } catch (e) {
    return c.json({ error: '토큰 갱신 중 오류가 발생했습니다.' }, 500)
  }
})

// ──────────────────────────────────────────────────────────
// GET /api/auth/me – 내 정보 조회
// ──────────────────────────────────────────────────────────
authRoutes.get('/me', async (c) => {
  try {
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

    const user = await c.env.DB.prepare(
      'SELECT id, email, name, phone, role, yacht_name, yacht_model, yacht_length, marina_berth, membership_type, created_at FROM users WHERE id = ?'
    ).bind(payload.userId).first()

    if (!user) return c.json({ error: '사용자를 찾을 수 없습니다.' }, 404)

    return c.json({ success: true, user })
  } catch (e) {
    return c.json({ error: '오류가 발생했습니다.' }, 500)
  }
})

// ──────────────────────────────────────────────────────────
// POST /api/auth/change-password – 비밀번호 변경
// ──────────────────────────────────────────────────────────
authRoutes.post('/change-password', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    let token = ''
    if (authHeader?.startsWith('Bearer ')) token = authHeader.slice(7)
    if (!token) return c.json({ error: '인증이 필요합니다.' }, 401)

    const secret  = c.env.JWT_SECRET || 'hyundai_yacht_care_secret_2024'
    const payload = await verifyJWT(token, secret)
    if (!payload) return c.json({ error: '유효하지 않은 토큰입니다.' }, 401)

    const body = await c.req.json().catch(() => null)
    if (!body) return c.json({ error: '요청 본문이 유효하지 않습니다.' }, 400)

    const { current_password, new_password } = body

    if (!current_password || !new_password) {
      return c.json({ error: '현재 비밀번호와 새 비밀번호를 모두 입력해주세요.' }, 400)
    }
    if (!PASSWORD_RE.test(new_password)) {
      return c.json({ error: '새 비밀번호는 영문+숫자 조합 8자 이상이어야 합니다.' }, 400)
    }

    const user = await c.env.DB.prepare(
      'SELECT id, password_hash FROM users WHERE id = ?'
    ).bind(payload.userId).first() as any
    if (!user) return c.json({ error: '사용자를 찾을 수 없습니다.' }, 404)

    const valid = await verifyPassword(current_password, user.password_hash)
    if (!valid) return c.json({ error: '현재 비밀번호가 올바르지 않습니다.' }, 400)

    const newHash = await hashPassword(new_password)
    await c.env.DB.prepare(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(newHash, payload.userId).run()

    return c.json({ success: true, message: '비밀번호가 변경되었습니다.' })
  } catch (e) {
    return c.json({ error: '비밀번호 변경 중 오류가 발생했습니다.' }, 500)
  }
})

export default authRoutes
