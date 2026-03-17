-- 현대요트 케어서비스 데이터베이스 스키마

-- 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'customer', -- 'customer', 'admin', 'staff'
  yacht_name TEXT,
  yacht_model TEXT,
  yacht_length REAL, -- 미터 단위
  marina_berth TEXT,
  membership_type TEXT DEFAULT 'standard', -- 'standard', 'premium', 'vip'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 서비스 패키지 테이블
CREATE TABLE IF NOT EXISTS service_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL, -- 'basic', 'premium', 'signature'
  description TEXT,
  price_base INTEGER NOT NULL, -- 기본 가격 (원)
  price_per_meter INTEGER DEFAULT 0, -- 미터당 추가 가격
  duration_hours INTEGER DEFAULT 8, -- 예상 소요 시간
  features TEXT, -- JSON 배열 형태로 저장
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 서비스 항목 테이블
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id INTEGER,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- 'exterior', 'interior', 'mechanical', 'safety'
  description TEXT,
  price INTEGER NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (package_id) REFERENCES service_packages(id)
);

-- 예약 테이블
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_number TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  package_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  estimated_duration INTEGER, -- 분 단위
  yacht_name TEXT NOT NULL,
  yacht_model TEXT,
  yacht_length REAL,
  marina_berth TEXT,
  special_requests TEXT,
  total_price INTEGER NOT NULL,
  payment_status TEXT DEFAULT 'unpaid', -- 'unpaid', 'paid', 'refunded'
  admin_notes TEXT,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (package_id) REFERENCES service_packages(id)
);

-- 예약 서비스 항목 테이블 (예약-서비스 다대다)
CREATE TABLE IF NOT EXISTS booking_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  service_id INTEGER NOT NULL,
  quantity INTEGER DEFAULT 1,
  price INTEGER NOT NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (service_id) REFERENCES services(id)
);

-- 서비스 이력 테이블
CREATE TABLE IF NOT EXISTS service_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  service_type TEXT NOT NULL,
  description TEXT,
  technician_name TEXT,
  parts_used TEXT, -- JSON
  before_photos TEXT, -- JSON 배열 (URL)
  after_photos TEXT, -- JSON 배열 (URL)
  next_service_date DATE,
  notes TEXT,
  completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 점검 일정 테이블
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

-- 문의 테이블
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  inquiry_type TEXT NOT NULL, -- 'general', 'booking', 'service', 'complaint'
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'answered', 'closed'
  answer TEXT,
  answered_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 가용 시간대 테이블
CREATE TABLE IF NOT EXISTS available_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_date DATE NOT NULL,
  slot_time TIME NOT NULL,
  max_bookings INTEGER DEFAULT 3,
  current_bookings INTEGER DEFAULT 0,
  is_available INTEGER DEFAULT 1,
  UNIQUE(slot_date, slot_time)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_date ON bookings(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_service_history_user_id ON service_history(user_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_user_id ON maintenance_schedule(user_id);
