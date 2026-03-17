import { Hono } from 'hono'
import { Env } from '../types'
import { authMiddleware } from '../middleware/auth'

const userRoutes = new Hono<{ Bindings: Env; Variables: { user: any } }>()

// 서비스 이력 조회
userRoutes.get('/service-history', authMiddleware(), async (c) => {
  try {
    const user = c.get('user')
    
    const history = await c.env.DB.prepare(`
      SELECT sh.*, b.booking_number, b.scheduled_date, b.yacht_name
      FROM service_history sh
      JOIN bookings b ON sh.booking_id = b.id
      WHERE sh.user_id = ?
      ORDER BY sh.completed_at DESC
    `).bind(user.userId).all()
    
    return c.json({ success: true, history: history.results })
  } catch (e) {
    return c.json({ error: '조회 중 오류가 발생했습니다.' }, 500)
  }
})

// 정기 점검 일정 조회
userRoutes.get('/maintenance', authMiddleware(), async (c) => {
  try {
    const user = c.get('user')
    
    const schedule = await c.env.DB.prepare(`
      SELECT * FROM maintenance_schedule
      WHERE user_id = ? AND is_completed = 0
      ORDER BY due_date ASC
    `).bind(user.userId).all()
    
    return c.json({ success: true, schedule: schedule.results })
  } catch (e) {
    return c.json({ error: '조회 중 오류가 발생했습니다.' }, 500)
  }
})

// 프로필 업데이트
userRoutes.put('/profile', authMiddleware(), async (c) => {
  try {
    const user = c.get('user')
    const { name, phone, yacht_name, yacht_model, yacht_length, marina_berth } = await c.req.json()
    
    await c.env.DB.prepare(`
      UPDATE users 
      SET name = COALESCE(?, name),
          phone = COALESCE(?, phone),
          yacht_name = COALESCE(?, yacht_name),
          yacht_model = COALESCE(?, yacht_model),
          yacht_length = COALESCE(?, yacht_length),
          marina_berth = COALESCE(?, marina_berth),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(name || null, phone || null, yacht_name || null, yacht_model || null, yacht_length || null, marina_berth || null, user.userId).run()
    
    return c.json({ success: true, message: '프로필이 업데이트되었습니다.' })
  } catch (e) {
    return c.json({ error: '업데이트 중 오류가 발생했습니다.' }, 500)
  }
})

export default userRoutes
