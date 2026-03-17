import { Hono } from 'hono'
import { Env } from '../types'
import { createJWT, hashPassword, verifyPassword } from '../middleware/auth'

const authRoutes = new Hono<{ Bindings: Env }>()

// 로그인
authRoutes.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json()
    
    if (!email || !password) {
      return c.json({ error: '이메일과 비밀번호를 입력해주세요.' }, 400)
    }
    
    const user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(email).first()
    
    if (!user) {
      return c.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
    }
    
    // 데모 계정 처리
    let passwordValid = false
    if (email === 'admin@hyundaiyacht.com' && password === 'Admin1234!') {
      passwordValid = true
    } else if (email === 'demo@hyundaiyacht.com' && password === 'Demo1234!') {
      passwordValid = true
    } else {
      passwordValid = await verifyPassword(password, user.password_hash as string)
    }
    
    if (!passwordValid) {
      return c.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
    }
    
    const secret = c.env.JWT_SECRET || 'hyundai_yacht_care_secret_2024'
    const token = await createJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 // 7일
    }, secret)
    
    return c.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        membership_type: user.membership_type,
        yacht_name: user.yacht_name
      }
    })
  } catch (e) {
    console.error('Login error:', e)
    return c.json({ error: '로그인 중 오류가 발생했습니다.' }, 500)
  }
})

// 회원가입
authRoutes.post('/register', async (c) => {
  try {
    const { email, password, name, phone, yacht_name, yacht_model, yacht_length, marina_berth } = await c.req.json()
    
    if (!email || !password || !name) {
      return c.json({ error: '필수 정보를 모두 입력해주세요.' }, 400)
    }
    
    if (password.length < 8) {
      return c.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, 400)
    }
    
    // 이메일 중복 확인
    const existing = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email).first()
    
    if (existing) {
      return c.json({ error: '이미 등록된 이메일입니다.' }, 409)
    }
    
    const passwordHash = await hashPassword(password)
    
    const result = await c.env.DB.prepare(`
      INSERT INTO users (email, password_hash, name, phone, yacht_name, yacht_model, yacht_length, marina_berth)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(email, passwordHash, name, phone || null, yacht_name || null, yacht_model || null, yacht_length || null, marina_berth || null).run()
    
    const secret = c.env.JWT_SECRET || 'hyundai_yacht_care_secret_2024'
    const token = await createJWT({
      userId: result.meta.last_row_id,
      email,
      role: 'customer',
      name,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
    }, secret)
    
    return c.json({
      success: true,
      token,
      user: {
        id: result.meta.last_row_id,
        email,
        name,
        role: 'customer',
        membership_type: 'standard'
      }
    })
  } catch (e) {
    console.error('Register error:', e)
    return c.json({ error: '회원가입 중 오류가 발생했습니다.' }, 500)
  }
})

// 내 정보 조회
authRoutes.get('/me', async (c) => {
  try {
    const { createJWT: _, verifyJWT } = await import('../middleware/auth')
    const authHeader = c.req.header('Authorization')
    const cookieHeader = c.req.header('Cookie')
    
    let token = ''
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7)
    } else if (cookieHeader) {
      const m = cookieHeader.match(/token=([^;]+)/)
      if (m) token = m[1]
    }
    
    if (!token) return c.json({ error: '인증이 필요합니다.' }, 401)
    
    const secret = c.env.JWT_SECRET || 'hyundai_yacht_care_secret_2024'
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

export default authRoutes
