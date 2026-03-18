import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { Env } from './types'
import authRoutes from './routes/auth'
import bookingRoutes from './routes/bookings'
import adminRoutes from './routes/admin'
import userRoutes from './routes/users'
import inquiryRoutes from './routes/inquiries'

const app = new Hono<{ Bindings: Env }>()

// CORS
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

// API 라우트
app.route('/api/auth', authRoutes)
app.route('/api/bookings', bookingRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api/users', userRoutes)
app.route('/api/inquiries', inquiryRoutes)

// DB 초기화 엔드포인트 (개발용)
app.post('/api/init-db', async (c) => {
  try {
    const sql = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        role TEXT NOT NULL DEFAULT 'customer',
        yacht_name TEXT,
        yacht_model TEXT,
        yacht_length REAL,
        marina_berth TEXT,
        membership_type TEXT DEFAULT 'standard',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS service_packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        description TEXT,
        price_base INTEGER NOT NULL,
        price_per_meter INTEGER DEFAULT 0,
        duration_hours INTEGER DEFAULT 8,
        features TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        package_id INTEGER,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        price INTEGER NOT NULL,
        duration_minutes INTEGER DEFAULT 60,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (package_id) REFERENCES service_packages(id)
      );
      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_number TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        package_id INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        scheduled_date DATE NOT NULL,
        scheduled_time TIME NOT NULL,
        estimated_duration INTEGER,
        yacht_name TEXT NOT NULL,
        yacht_model TEXT,
        yacht_length REAL,
        marina_berth TEXT,
        special_requests TEXT,
        total_price INTEGER NOT NULL,
        payment_status TEXT DEFAULT 'unpaid',
        admin_notes TEXT,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (package_id) REFERENCES service_packages(id)
      );
      CREATE TABLE IF NOT EXISTS service_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        service_type TEXT NOT NULL,
        description TEXT,
        technician_name TEXT,
        parts_used TEXT,
        before_photos TEXT,
        after_photos TEXT,
        next_service_date DATE,
        notes TEXT,
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS maintenance_schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        service_type TEXT NOT NULL,
        due_date DATE NOT NULL,
        is_completed INTEGER DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS inquiries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        inquiry_type TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        answer TEXT,
        answered_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS available_slots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slot_date DATE NOT NULL,
        slot_time TIME NOT NULL,
        max_bookings INTEGER DEFAULT 3,
        current_bookings INTEGER DEFAULT 0,
        is_available INTEGER DEFAULT 1,
        UNIQUE(slot_date, slot_time)
      );
    `
    
    const statements = sql.split(';').filter(s => s.trim())
    for (const stmt of statements) {
      if (stmt.trim()) await c.env.DB.prepare(stmt).run()
    }
    
    // 기본 데이터
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO service_packages (name, code, description, price_base, price_per_meter, duration_hours, features) VALUES
      ('Basic Care', 'basic', '기본적인 외부 세척과 점검으로 요트를 최상의 컨디션으로 유지합니다.', 350000, 15000, 4, '["외부 선체 고압 세척","갑판 청소 및 왁싱","기본 엔진 점검","항법 장비 점검","기본 안전 장비 확인"]')
    `).run()
    
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO service_packages (name, code, description, price_base, price_per_meter, duration_hours, features) VALUES
      ('Premium Care', 'premium', '내외부 전문 케어와 심층 기계 점검으로 프리미엄 컨디션을 보장합니다.', 680000, 22000, 8, '["Basic Care 전 서비스 포함","내부 전문 청소 및 왁싱","엔진 오일 및 필터 교환","배터리 및 전기 시스템 점검","연료 시스템 점검","윤활 처리","전문 폴리싱"]')
    `).run()
    
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO service_packages (name, code, description, price_base, price_per_meter, duration_hours, features) VALUES
      ('Signature Care', 'signature', '현대요트 전문 기술진의 완전한 케어. 최고의 보호와 완벽한 컨디션을 위한 프리미엄 서비스입니다.', 1200000, 35000, 16, '["Premium Care 전 서비스 포함","선체 세라믹 코팅","전기 및 배선 완전 점검","리깅 및 세일 점검","항법 시스템 캘리브레이션","비상 장비 교체","전담 서비스 매니저 배정","12개월 정기 점검 스케줄"]')
    `).run()
    
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO users (email, password_hash, name, phone, role, membership_type) VALUES ('admin@hyundaiyacht.com', 'admin_hash', '관리자', '02-0000-0000', 'admin', 'vip')"
    ).run()
    
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO users (email, password_hash, name, phone, role, yacht_name, yacht_model, yacht_length, marina_berth, membership_type) VALUES ('demo@hyundaiyacht.com', 'demo_hash', '김민준', '010-1234-5678', 'customer', 'Sea Breeze', 'Hyundai Wando 470', 14.3, 'A-24', 'premium')"
    ).run()
    
    // 슬롯 동적 생성 (오늘부터 10주, 평일+주말 09:00 / 13:00)
    const slotToday = new Date()
    slotToday.setHours(0, 0, 0, 0)
    const slotTimes = ['09:00', '13:00']
    let slotCreated = 0
    for (let d = 0; d < 70; d++) {
      const dt = new Date(slotToday)
      dt.setDate(slotToday.getDate() + d)
      const dow = dt.getDay()
      if (dow === 0) continue // 일요일 제외
      const dateStr = dt.toISOString().split('T')[0]
      for (const t of slotTimes) {
        const existing = await c.env.DB.prepare(
          'SELECT id FROM available_slots WHERE slot_date=? AND slot_time=?'
        ).bind(dateStr, t).first()
        if (!existing) {
          await c.env.DB.prepare(
            'INSERT INTO available_slots (slot_date, slot_time, max_bookings, current_bookings, is_available) VALUES (?,?,3,0,1)'
          ).bind(dateStr, t).run()
          slotCreated++
        }
      }
    }
    console.log(`슬롯 ${slotCreated}개 생성됨`)
    
    // 데모 예약 이력
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO bookings (booking_number, user_id, package_id, status, scheduled_date, scheduled_time, yacht_name, yacht_model, yacht_length, marina_berth, total_price, payment_status)
      VALUES ('HY20241201DEMO', 2, 2, 'completed', '2025-12-01', '09:00', 'Sea Breeze', 'Hyundai Wando 470', 14.3, 'A-24', 994600, 'paid')
    `).run()
    
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO bookings (booking_number, user_id, package_id, status, scheduled_date, scheduled_time, yacht_name, yacht_model, yacht_length, marina_berth, total_price, payment_status)
      VALUES ('HY20250315DEMO', 2, 3, 'completed', '2026-01-15', '09:00', 'Sea Breeze', 'Hyundai Wando 470', 14.3, 'A-24', 1700500, 'paid')
    `).run()
    
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO service_history (booking_id, user_id, service_type, description, technician_name, next_service_date, notes)
      VALUES (1, 2, 'Premium Care', '외부 세척, 엔진 오일 교환, 배터리 점검 완료', '박기술 선임', '2026-06-01', '다음 점검 시 연료 시스템 필터 교환 권장')
    `).run()
    
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO maintenance_schedule (user_id, service_type, due_date, notes)
      VALUES (2, '정기 엔진 오일 교환', '2026-06-01', '6개월 정기 점검')
    `).run()
    
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO maintenance_schedule (user_id, service_type, due_date, notes)
      VALUES (2, '안전 장비 점검', '2026-07-15', '연간 안전 점검')
    `).run()
    
    return c.json({ success: true, message: 'DB 초기화 완료' })
  } catch (e: any) {
    console.error('Init DB error:', e)
    return c.json({ error: e.message }, 500)
  }
})

// 정적 파일 서빙
app.use('/static/*', serveStatic({ root: './' }))

// SPA 폴백 - index.html 반환
app.get('*', async (c) => {
  const html = await c.env.ASSETS?.fetch(new Request(new URL('/', c.req.url)))
  if (html) return html
  return c.text('Not Found', 404)
})

export default app
