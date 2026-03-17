import { Hono } from 'hono'
import { Env } from '../types'
import { authMiddleware } from '../middleware/auth'

const bookingRoutes = new Hono<{ Bindings: Env; Variables: { user: any } }>()

// 예약 가능한 날짜/시간 조회
bookingRoutes.get('/available-slots', async (c) => {
  try {
    const { date } = c.req.query()
    
    let query = `
      SELECT slot_date, slot_time, max_bookings, current_bookings,
             (max_bookings - current_bookings) as available_count,
             is_available
      FROM available_slots 
      WHERE is_available = 1 
        AND slot_date >= date('now')
        AND (max_bookings - current_bookings) > 0
    `
    const params: any[] = []
    
    if (date) {
      query += ' AND slot_date = ?'
      params.push(date)
    }
    
    query += ' ORDER BY slot_date, slot_time LIMIT 100'
    
    const slots = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ success: true, slots: slots.results })
  } catch (e) {
    console.error(e)
    return c.json({ error: '조회 중 오류가 발생했습니다.' }, 500)
  }
})

// 서비스 패키지 조회
bookingRoutes.get('/packages', async (c) => {
  try {
    const packages = await c.env.DB.prepare(
      'SELECT * FROM service_packages WHERE is_active = 1 ORDER BY price_base ASC'
    ).all()
    
    const packagesWithFeatures = packages.results.map((pkg: any) => ({
      ...pkg,
      features: JSON.parse(pkg.features || '[]')
    }))
    
    return c.json({ success: true, packages: packagesWithFeatures })
  } catch (e) {
    return c.json({ error: '조회 중 오류가 발생했습니다.' }, 500)
  }
})

// 개별 서비스 조회
bookingRoutes.get('/services', async (c) => {
  try {
    const services = await c.env.DB.prepare(
      'SELECT * FROM services WHERE is_active = 1 ORDER BY category, name'
    ).all()
    return c.json({ success: true, services: services.results })
  } catch (e) {
    return c.json({ error: '조회 중 오류가 발생했습니다.' }, 500)
  }
})

// 예약 생성
bookingRoutes.post('/', authMiddleware(), async (c) => {
  try {
    const user = c.get('user')
    const {
      package_id,
      scheduled_date,
      scheduled_time,
      yacht_name,
      yacht_model,
      yacht_length,
      marina_berth,
      special_requests,
      total_price
    } = await c.req.json()
    
    if (!scheduled_date || !scheduled_time || !yacht_name || !total_price) {
      return c.json({ error: '필수 정보를 모두 입력해주세요.' }, 400)
    }
    
    // 가용 슬롯 확인
    const slot = await c.env.DB.prepare(
      'SELECT * FROM available_slots WHERE slot_date = ? AND slot_time = ? AND is_available = 1'
    ).bind(scheduled_date, scheduled_time).first()
    
    if (!slot) {
      return c.json({ error: '선택한 날짜/시간에 예약이 불가합니다.' }, 400)
    }
    
    if ((slot.current_bookings as number) >= (slot.max_bookings as number)) {
      return c.json({ error: '선택한 시간대가 마감되었습니다.' }, 400)
    }
    
    // 예약 번호 생성
    const bookingNumber = `HY${Date.now().toString().slice(-8)}${Math.random().toString(36).slice(-4).toUpperCase()}`
    
    // 예약 생성
    const result = await c.env.DB.prepare(`
      INSERT INTO bookings 
        (booking_number, user_id, package_id, scheduled_date, scheduled_time, 
         yacht_name, yacht_model, yacht_length, marina_berth, special_requests, total_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      bookingNumber, user.userId, package_id || null,
      scheduled_date, scheduled_time,
      yacht_name, yacht_model || null, yacht_length || null,
      marina_berth || null, special_requests || null, total_price
    ).run()
    
    // 슬롯 업데이트
    await c.env.DB.prepare(
      'UPDATE available_slots SET current_bookings = current_bookings + 1 WHERE slot_date = ? AND slot_time = ?'
    ).bind(scheduled_date, scheduled_time).run()
    
    return c.json({
      success: true,
      booking: {
        id: result.meta.last_row_id,
        booking_number: bookingNumber,
        status: 'pending'
      }
    })
  } catch (e) {
    console.error('Booking error:', e)
    return c.json({ error: '예약 중 오류가 발생했습니다.' }, 500)
  }
})

// 내 예약 목록
bookingRoutes.get('/my', authMiddleware(), async (c) => {
  try {
    const user = c.get('user')
    
    const bookings = await c.env.DB.prepare(`
      SELECT b.*, sp.name as package_name, sp.code as package_code
      FROM bookings b
      LEFT JOIN service_packages sp ON b.package_id = sp.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `).bind(user.userId).all()
    
    return c.json({ success: true, bookings: bookings.results })
  } catch (e) {
    return c.json({ error: '조회 중 오류가 발생했습니다.' }, 500)
  }
})

// 예약 상세 조회
bookingRoutes.get('/:id', authMiddleware(), async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    
    const booking = await c.env.DB.prepare(`
      SELECT b.*, sp.name as package_name, sp.code as package_code, sp.features as package_features
      FROM bookings b
      LEFT JOIN service_packages sp ON b.package_id = sp.id
      WHERE b.id = ? AND (b.user_id = ? OR ? = 'admin')
    `).bind(id, user.userId, user.role).first()
    
    if (!booking) {
      return c.json({ error: '예약을 찾을 수 없습니다.' }, 404)
    }
    
    return c.json({ success: true, booking })
  } catch (e) {
    return c.json({ error: '조회 중 오류가 발생했습니다.' }, 500)
  }
})

// 예약 취소
bookingRoutes.delete('/:id', authMiddleware(), async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    
    const booking = await c.env.DB.prepare(
      'SELECT * FROM bookings WHERE id = ? AND user_id = ?'
    ).bind(id, user.userId).first()
    
    if (!booking) {
      return c.json({ error: '예약을 찾을 수 없습니다.' }, 404)
    }
    
    if (booking.status === 'completed' || booking.status === 'in_progress') {
      return c.json({ error: '진행 중이거나 완료된 예약은 취소할 수 없습니다.' }, 400)
    }
    
    await c.env.DB.prepare(
      'UPDATE bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind('cancelled', id).run()
    
    // 슬롯 복원
    await c.env.DB.prepare(
      'UPDATE available_slots SET current_bookings = MAX(0, current_bookings - 1) WHERE slot_date = ? AND slot_time = ?'
    ).bind(booking.scheduled_date, booking.scheduled_time).run()
    
    return c.json({ success: true, message: '예약이 취소되었습니다.' })
  } catch (e) {
    return c.json({ error: '취소 중 오류가 발생했습니다.' }, 500)
  }
})

export default bookingRoutes
