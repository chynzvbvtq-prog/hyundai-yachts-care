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
    const body = await c.req.json()

    // 클라이언트가 보내는 다양한 필드명 정규화
    const scheduled_date  = body.scheduled_date
    const scheduled_time  = body.scheduled_time
    const yacht_name      = body.yacht_name
    const yacht_model     = body.yacht_model || null
    const yacht_length    = body.yacht_length || null
    // marina / marina_berth 둘 다 허용
    const marina_berth    = body.marina_berth || body.marina || null
    const special_requests = body.special_requests || body.notes || null
    // total_price / estimated_price 둘 다 허용
    const total_price     = body.total_price || body.estimated_price || 0
    // package_id(숫자) 또는 package_type(코드문자열) 둘 다 허용
    let package_id: number | null = body.package_id ? Number(body.package_id) : null
    if (!package_id && body.package_type) {
      const pkg = await c.env.DB.prepare(
        'SELECT id FROM service_packages WHERE code = ?'
      ).bind(body.package_type).first()
      if (pkg) package_id = pkg.id as number
    }

    if (!scheduled_date || !scheduled_time || !yacht_name) {
      return c.json({ error: '필수 정보를 모두 입력해주세요. (날짜, 시간, 요트명)' }, 400)
    }
    
    // 가용 슬롯 확인 - 없으면 자동 생성 (유연한 예약 허용)
    let slot = await c.env.DB.prepare(
      'SELECT * FROM available_slots WHERE slot_date = ? AND slot_time = ? AND is_available = 1'
    ).bind(scheduled_date, scheduled_time).first()
    
    if (!slot) {
      // 슬롯이 없으면 자동으로 생성
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO available_slots (slot_date, slot_time, max_bookings, current_bookings, is_available)
         VALUES (?, ?, 3, 0, 1)`
      ).bind(scheduled_date, scheduled_time).run()
      slot = await c.env.DB.prepare(
        'SELECT * FROM available_slots WHERE slot_date = ? AND slot_time = ?'
      ).bind(scheduled_date, scheduled_time).first()
    }
    
    if (slot && (slot.current_bookings as number) >= (slot.max_bookings as number)) {
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
      bookingNumber, user.userId, package_id,
      scheduled_date, scheduled_time,
      yacht_name, yacht_model, yacht_length,
      marina_berth, special_requests, total_price
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
