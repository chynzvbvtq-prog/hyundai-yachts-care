-- 기본 데이터 삽입

-- 서비스 패키지
INSERT OR IGNORE INTO service_packages (name, code, description, price_base, price_per_meter, duration_hours, features) VALUES
(
  'Basic Care',
  'basic',
  '기본적인 외부 세척과 점검으로 요트를 최상의 컨디션으로 유지합니다.',
  350000,
  15000,
  4,
  '["외부 선체 고압 세척","갑판 청소 및 왁싱","기본 엔진 점검","항법 장비 점검","기본 안전 장비 확인"]'
),
(
  'Premium Care',
  'premium',
  '내외부 전문 케어와 심층 기계 점검으로 프리미엄 컨디션을 보장합니다.',
  680000,
  22000,
  8,
  '["Basic Care 전 서비스 포함","내부 전문 청소 및 왁싱","엔진 오일 및 필터 교환","배터리 및 전기 시스템 점검","연료 시스템 점검","윤활 처리","전문 폴리싱"]'
),
(
  'Signature Care',
  'signature',
  '현대요트 전문 기술진의 완전한 케어. 최고의 보호와 완벽한 컨디션을 위한 프리미엄 서비스입니다.',
  1200000,
  35000,
  16,
  '["Premium Care 전 서비스 포함","선체 세라믹 코팅","전기 및 배선 완전 점검","리깅 및 세일 점검","항법 시스템 캘리브레이션","비상 장비 교체","전담 서비스 매니저 배정","12개월 정기 점검 스케줄"]'
);

-- 개별 서비스 항목
INSERT OR IGNORE INTO services (package_id, name, category, description, price, duration_minutes) VALUES
(NULL, '선체 고압 세척', 'exterior', '전문 장비를 사용한 선체 고압 세척', 80000, 90),
(NULL, '갑판 왁싱 및 폴리싱', 'exterior', '갑판 전체 왁싱 및 폴리싱 처리', 120000, 120),
(NULL, '세라믹 코팅', 'exterior', '최고급 세라믹 코팅으로 장기 보호', 450000, 360),
(NULL, '내부 전문 청소', 'interior', '선실 내부 전문 청소 및 살균', 150000, 180),
(NULL, '엔진 오일 교환', 'mechanical', '엔진 오일 및 필터 교환', 80000, 60),
(NULL, '배터리 점검 및 교환', 'mechanical', '선박 배터리 점검 및 교환', 120000, 90),
(NULL, '연료 시스템 점검', 'mechanical', '연료 탱크 및 시스템 점검', 100000, 120),
(NULL, '안전 장비 점검', 'safety', '구명 장비, 소화기 등 안전 장비 점검', 70000, 60),
(NULL, '항법 장비 캘리브레이션', 'mechanical', 'GPS, 나침반 등 항법 장비 보정', 90000, 90),
(NULL, '리깅 점검', 'mechanical', '마스트, 리깅 와이어 등 점검', 130000, 120);

-- 관리자 계정 생성 (비밀번호: Admin1234! -> 실제로는 해시값)
INSERT OR IGNORE INTO users (email, password_hash, name, phone, role, membership_type) VALUES
('admin@hyundaiyacht.com', '$2b$10$admin_hash_placeholder', '관리자', '02-0000-0000', 'admin', 'vip'),
('demo@hyundaiyacht.com', '$2b$10$demo_hash_placeholder', '데모 고객', '010-1234-5678', 'customer', 'premium');

-- 가용 시간대 생성 (현재부터 30일)
INSERT OR IGNORE INTO available_slots (slot_date, slot_time, max_bookings) VALUES
('2026-03-18', '09:00', 3),
('2026-03-18', '13:00', 2),
('2026-03-19', '09:00', 3),
('2026-03-19', '13:00', 2),
('2026-03-20', '09:00', 3),
('2026-03-21', '09:00', 3),
('2026-03-21', '13:00', 2),
('2026-03-22', '09:00', 3),
('2026-03-24', '09:00', 3),
('2026-03-24', '13:00', 2),
('2026-03-25', '09:00', 3),
('2026-03-26', '09:00', 3),
('2026-03-27', '09:00', 3),
('2026-03-28', '09:00', 3),
('2026-03-28', '13:00', 2),
('2026-03-31', '09:00', 3),
('2026-04-01', '09:00', 3),
('2026-04-02', '09:00', 3);
