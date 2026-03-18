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

// ─────────────────────────────────────────
// 슬롯 관리 API
// ─────────────────────────────────────────

// 슬롯 목록 조회 (주간 범위)
adminRoutes.get('/slots', async (c) => {
  try {
    const { from, to } = c.req.query()
    let query = `
      SELECT s.*,
        (SELECT COUNT(*) FROM bookings b
         WHERE b.scheduled_date = s.slot_date
           AND b.scheduled_time = s.slot_time
           AND b.status NOT IN ('cancelled')) as booked_count
      FROM available_slots s
      WHERE 1=1
    `
    const params: any[] = []
    if (from) { query += ' AND slot_date >= ?'; params.push(from) }
    if (to)   { query += ' AND slot_date <= ?'; params.push(to)   }
    query += ' ORDER BY slot_date ASC, slot_time ASC'

    const slots = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ success: true, slots: slots.results })
  } catch (e) {
    return c.json({ error: '조회 중 오류가 발생했습니다.' }, 500)
  }
})

// 단일 슬롯 추가
adminRoutes.post('/slots', async (c) => {
  try {
    const { slot_date, slot_time, max_bookings = 3 } = await c.req.json()
    if (!slot_date || !slot_time) return c.json({ error: '날짜와 시간을 입력해주세요.' }, 400)

    await c.env.DB.prepare(`
      INSERT OR REPLACE INTO available_slots (slot_date, slot_time, max_bookings, current_bookings, is_available)
      VALUES (?, ?, ?, 0, 1)
    `).bind(slot_date, slot_time, max_bookings).run()
    
    return c.json({ success: true, message: '슬롯이 추가되었습니다.' })
  } catch (e) {
    return c.json({ error: '추가 중 오류가 발생했습니다.' }, 500)
  }
})

// 향후 N주 슬롯 일괄 자동 생성
adminRoutes.post('/slots/generate', async (c) => {
  try {
    const { weeks = 8, times = ['09:00', '13:00'], max_bookings = 3, skip_weekends = false } = await c.req.json()

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let created = 0

    for (let d = 0; d < weeks * 7; d++) {
      const date = new Date(today)
      date.setDate(today.getDate() + d)
      const dow = date.getDay() // 0=일, 6=토
      if (skip_weekends && (dow === 0 || dow === 6)) continue

      const dateStr = date.toISOString().split('T')[0]

      for (const t of times) {
        const existing = await c.env.DB.prepare(
          'SELECT id FROM available_slots WHERE slot_date=? AND slot_time=?'
        ).bind(dateStr, t).first()
        if (!existing) {
          await c.env.DB.prepare(
            'INSERT INTO available_slots (slot_date, slot_time, max_bookings, current_bookings, is_available) VALUES (?,?,?,0,1)'
          ).bind(dateStr, t, max_bookings).run()
          created++
        }
      }
    }

    return c.json({ success: true, message: `${created}개 슬롯이 생성되었습니다.`, created })
  } catch (e: any) {
    return c.json({ error: e.message || '생성 중 오류가 발생했습니다.' }, 500)
  }
})

// 슬롯 차단/활성화 토글
adminRoutes.patch('/slots/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { is_available, max_bookings } = await c.req.json()

    await c.env.DB.prepare(`
      UPDATE available_slots
      SET is_available = COALESCE(?, is_available),
          max_bookings = COALESCE(?, max_bookings)
      WHERE id = ?
    `).bind(
      is_available !== undefined ? (is_available ? 1 : 0) : null,
      max_bookings ?? null,
      id
    ).run()

    return c.json({ success: true })
  } catch (e) {
    return c.json({ error: '업데이트 중 오류가 발생했습니다.' }, 500)
  }
})

// 슬롯 삭제 (예약 없는 경우만)
adminRoutes.delete('/slots/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const slot = await c.env.DB.prepare('SELECT * FROM available_slots WHERE id=?').bind(id).first() as any
    if (!slot) return c.json({ error: '슬롯을 찾을 수 없습니다.' }, 404)
    if ((slot.current_bookings || 0) > 0) return c.json({ error: '예약이 있는 슬롯은 삭제할 수 없습니다.' }, 400)

    await c.env.DB.prepare('DELETE FROM available_slots WHERE id=?').bind(id).run()
    return c.json({ success: true })
  } catch (e) {
    return c.json({ error: '삭제 중 오류가 발생했습니다.' }, 500)
  }
})

// 날짜 단위 슬롯 전체 차단
adminRoutes.post('/slots/block-date', async (c) => {
  try {
    const { slot_date } = await c.req.json()
    if (!slot_date) return c.json({ error: '날짜를 입력해주세요.' }, 400)

    await c.env.DB.prepare(
      "UPDATE available_slots SET is_available=0 WHERE slot_date=?"
    ).bind(slot_date).run()

    return c.json({ success: true, message: `${slot_date} 전체 슬롯이 차단되었습니다.` })
  } catch (e) {
    return c.json({ error: '차단 중 오류가 발생했습니다.' }, 500)
  }
})

// 월별 통계 (차트용)
adminRoutes.get('/stats/monthly', async (c) => {
  try {
    // 최근 6개월 월별 예약수 + 매출
    const monthly = await c.env.DB.prepare(`
      SELECT 
        strftime('%Y-%m', scheduled_date) as month,
        COUNT(*) as booking_count,
        COALESCE(SUM(CASE WHEN status='completed' THEN total_price ELSE 0 END), 0) as revenue
      FROM bookings
      WHERE scheduled_date >= date('now', '-6 months')
      GROUP BY strftime('%Y-%m', scheduled_date)
      ORDER BY month ASC
    `).all()

    // 패키지별 예약 점유율
    const byPackage = await c.env.DB.prepare(`
      SELECT 
        COALESCE(sp.name, '기타') as package_name,
        COALESCE(sp.code, 'other') as package_code,
        COUNT(b.id) as count
      FROM bookings b
      LEFT JOIN service_packages sp ON b.package_id = sp.id
      GROUP BY b.package_id
      ORDER BY count DESC
    `).all()

    // 상태별 예약 현황
    const byStatus = await c.env.DB.prepare(`
      SELECT status, COUNT(*) as count
      FROM bookings
      GROUP BY status
    `).all()

    return c.json({
      success: true,
      monthly: monthly.results,
      byPackage: byPackage.results,
      byStatus: byStatus.results
    })
  } catch (e) {
    return c.json({ error: '통계 조회 중 오류가 발생했습니다.' }, 500)
  }
})

// 문의 목록 (검색 지원)
adminRoutes.get('/inquiries', async (c) => {
  try {
    const { search = '', status: statusFilter = '' } = c.req.query()
    let query = "SELECT * FROM inquiries WHERE 1=1"
    const params: any[] = []

    if (search) {
      query += " AND (name LIKE ? OR email LIKE ? OR subject LIKE ?)"
      const like = `%${search}%`
      params.push(like, like, like)
    }
    if (statusFilter) {
      query += " AND status = ?"
      params.push(statusFilter)
    }
    query += " ORDER BY created_at DESC LIMIT 100"

    const inquiries = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ success: true, inquiries: inquiries.results })
  } catch (e) {
    return c.json({ error: '조회 중 오류가 발생했습니다.' }, 500)
  }
})

// 문의 단건 조회
adminRoutes.get('/inquiries/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const inquiry = await c.env.DB.prepare(
      "SELECT * FROM inquiries WHERE id = ?"
    ).bind(id).first()
    if (!inquiry) return c.json({ error: '문의를 찾을 수 없습니다.' }, 404)
    return c.json({ success: true, inquiry })
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

// 고객 검색 지원
adminRoutes.get('/users/search', async (c) => {
  try {
    const { q = '' } = c.req.query()
    const like = `%${q}%`
    const users = await c.env.DB.prepare(`
      SELECT u.id, u.email, u.name, u.phone, u.role, u.membership_type,
             u.yacht_name, u.yacht_model, u.marina_berth, u.created_at,
             COUNT(b.id) as booking_count
      FROM users u
      LEFT JOIN bookings b ON u.id = b.user_id
      WHERE u.role = 'customer'
        AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.yacht_name LIKE ?)
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT 50
    `).bind(like, like, like, like).all()
    return c.json({ success: true, users: users.results })
  } catch (e) {
    return c.json({ error: '검색 중 오류가 발생했습니다.' }, 500)
  }
})

// 서비스 이력 등록 (완료 처리 시)
adminRoutes.post('/bookings/:id/complete', async (c) => {
  try {
    const bookingId = c.req.param('id')
    const { technician_name, description, parts_used, next_service_date, notes } = await c.req.json()

    // 예약 조회
    const booking = await c.env.DB.prepare(
      'SELECT * FROM bookings WHERE id = ?'
    ).bind(bookingId).first() as any
    if (!booking) return c.json({ error: '예약을 찾을 수 없습니다.' }, 404)

    // 예약 상태 → completed
    await c.env.DB.prepare(`
      UPDATE bookings SET status='completed', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(bookingId).run()

    // 서비스 이력 생성
    await c.env.DB.prepare(`
      INSERT INTO service_history 
        (booking_id, user_id, service_type, description, technician_name, parts_used, next_service_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      bookingId,
      booking.user_id,
      booking.package_id ? 'Package Service' : 'Custom Service',
      description || null,
      technician_name || null,
      parts_used || null,
      next_service_date || null,
      notes || null
    ).run()

    // 다음 점검일이 있으면 maintenance_schedule에 추가
    if (next_service_date) {
      await c.env.DB.prepare(`
        INSERT INTO maintenance_schedule (user_id, service_type, due_date, notes)
        VALUES (?, ?, ?, ?)
      `).bind(
        booking.user_id,
        '정기 점검',
        next_service_date,
        `${technician_name || '담당자'} 권장`
      ).run()
    }

    return c.json({ success: true, message: '서비스 완료 처리 및 이력이 등록되었습니다.' })
  } catch (e: any) {
    return c.json({ error: e.message || '처리 중 오류가 발생했습니다.' }, 500)
  }
})

export default adminRoutes
