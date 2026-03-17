import { Hono } from 'hono'
import { Env } from '../types'
import { authMiddleware } from '../middleware/auth'

const adminRoutes = new Hono<{ Bindings: Env; Variables: { user: any } }>()

// 모든 관리자 라우트에 인증 미들웨어 적용
adminRoutes.use('*', authMiddleware('admin'))

// 대시보드 통계
adminRoutes.get('/stats', async (c) => {
  try {
    const [totalBookings, pendingBookings, todayBookings, totalUsers, totalRevenue] = await Promise.all([
      c.env.DB.prepare('SELECT COUNT(*) as count FROM bookings').first(),
      c.env.DB.prepare("SELECT COUNT(*) as count FROM bookings WHERE status = 'pending'").first(),
      c.env.DB.prepare("SELECT COUNT(*) as count FROM bookings WHERE scheduled_date = date('now')").first(),
      c.env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'customer'").first(),
      c.env.DB.prepare("SELECT COALESCE(SUM(total_price), 0) as total FROM bookings WHERE status = 'completed'").first()
    ])
    
    return c.json({
      success: true,
      stats: {
        total_bookings: (totalBookings as any)?.count || 0,
        pending_bookings: (pendingBookings as any)?.count || 0,
        today_bookings: (todayBookings as any)?.count || 0,
        total_users: (totalUsers as any)?.count || 0,
        total_revenue: (totalRevenue as any)?.total || 0
      }
    })
  } catch (e) {
    return c.json({ error: '통계 조회 중 오류가 발생했습니다.' }, 500)
  }
})

// 전체 예약 목록
adminRoutes.get('/bookings', async (c) => {
  try {
    const { status, date, page = '1', limit = '20' } = c.req.query()
    const offset = (parseInt(page) - 1) * parseInt(limit)
    
    let query = `
      SELECT b.*, u.name as user_name, u.email as user_email, u.phone as user_phone,
             sp.name as package_name
      FROM bookings b
      LEFT JOIN users u ON b.user_id = u.id
      LEFT JOIN service_packages sp ON b.package_id = sp.id
      WHERE 1=1
    `
    const params: any[] = []
    
    if (status) {
      query += ' AND b.status = ?'
      params.push(status)
    }
    if (date) {
      query += ' AND b.scheduled_date = ?'
      params.push(date)
    }
    
    query += ` ORDER BY b.created_at DESC LIMIT ? OFFSET ?`
    params.push(parseInt(limit), offset)
    
    const bookings = await c.env.DB.prepare(query).bind(...params).all()
    const total = await c.env.DB.prepare('SELECT COUNT(*) as count FROM bookings').first()
    
    return c.json({
      success: true,
      bookings: bookings.results,
      pagination: {
        total: (total as any)?.count || 0,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    })
  } catch (e) {
    return c.json({ error: '조회 중 오류가 발생했습니다.' }, 500)
  }
})

// 예약 상태 업데이트
adminRoutes.patch('/bookings/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { status, admin_notes } = await c.req.json()
    
    const validStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled']
    if (status && !validStatuses.includes(status)) {
      return c.json({ error: '유효하지 않은 상태값입니다.' }, 400)
    }
    
    await c.env.DB.prepare(`
      UPDATE bookings 
      SET status = COALESCE(?, status),
          admin_notes = COALESCE(?, admin_notes),
          completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(status || null, admin_notes || null, status || null, id).run()
    
    return c.json({ success: true, message: '예약이 업데이트되었습니다.' })
  } catch (e) {
    return c.json({ error: '업데이트 중 오류가 발생했습니다.' }, 500)
  }
})

// 고객 목록
adminRoutes.get('/users', async (c) => {
  try {
    const { page = '1', limit = '20' } = c.req.query()
    const offset = (parseInt(page) - 1) * parseInt(limit)
    
    const users = await c.env.DB.prepare(`
      SELECT u.id, u.email, u.name, u.phone, u.role, u.membership_type,
             u.yacht_name, u.yacht_model, u.marina_berth, u.created_at,
             COUNT(b.id) as booking_count
      FROM users u
      LEFT JOIN bookings b ON u.id = b.user_id
      WHERE u.role = 'customer'
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(parseInt(limit), offset).all()
    
    const total = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM users WHERE role = 'customer'"
    ).first()
    
    return c.json({
      success: true,
      users: users.results,
      pagination: {
        total: (total as any)?.count || 0,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    })
  } catch (e) {
    return c.json({ error: '조회 중 오류가 발생했습니다.' }, 500)
  }
})

// 서비스 이력 추가
adminRoutes.post('/service-history', async (c) => {
  try {
    const {
      booking_id, user_id, service_type, description,
      technician_name, parts_used, next_service_date, notes
    } = await c.req.json()
    
    await c.env.DB.prepare(`
      INSERT INTO service_history 
        (booking_id, user_id, service_type, description, technician_name, parts_used, next_service_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      booking_id, user_id, service_type, description || null,
      technician_name || null, parts_used ? JSON.stringify(parts_used) : null,
      next_service_date || null, notes || null
    ).run()
    
    return c.json({ success: true, message: '서비스 이력이 등록되었습니다.' })
  } catch (e) {
    return c.json({ error: '등록 중 오류가 발생했습니다.' }, 500)
  }
})

// 가용 슬롯 관리
adminRoutes.post('/slots', async (c) => {
  try {
    const { slot_date, slot_time, max_bookings = 3 } = await c.req.json()
    
    await c.env.DB.prepare(`
      INSERT OR REPLACE INTO available_slots (slot_date, slot_time, max_bookings, current_bookings, is_available)
      VALUES (?, ?, ?, 0, 1)
    `).bind(slot_date, slot_time, max_bookings).run()
    
    return c.json({ success: true, message: '슬롯이 추가되었습니다.' })
  } catch (e) {
    return c.json({ error: '추가 중 오류가 발생했습니다.' }, 500)
  }
})

// 문의 목록
adminRoutes.get('/inquiries', async (c) => {
  try {
    const inquiries = await c.env.DB.prepare(
      "SELECT * FROM inquiries ORDER BY created_at DESC LIMIT 50"
    ).all()
    return c.json({ success: true, inquiries: inquiries.results })
  } catch (e) {
    return c.json({ error: '조회 중 오류가 발생했습니다.' }, 500)
  }
})

// 문의 답변
adminRoutes.patch('/inquiries/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { answer, status } = await c.req.json()
    
    await c.env.DB.prepare(`
      UPDATE inquiries 
      SET answer = ?, status = COALESCE(?, status), answered_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(answer, status || null, id).run()
    
    return c.json({ success: true })
  } catch (e) {
    return c.json({ error: '답변 중 오류가 발생했습니다.' }, 500)
  }
})

export default adminRoutes
