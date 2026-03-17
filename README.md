# HYUNDAI YACHT CARE

## 프로젝트 개요
- **이름**: Hyundai Yacht Care (현대요트 케어서비스)
- **목표**: 프리미엄 요트 케어 예약 및 관리 플랫폼
- **타겟**: 고급 요트 오너 및 마리나 회원

## 완성된 기능

### 메인 페이지 (`/`)
- 풀스크린 Hero 섹션 (애니메이션 + 통계 카운터)
- 서비스 패키지 3종 (베이직 / 프리미엄 / 시그니처)
- 5단계 케어 프로세스 타임라인
- 교차 배치 특장점 섹션 (3개)
- 실시간 견적 계산기 (패키지 + 크기 + 추가)
- 고객 후기 3개
- FAQ 6개 (아코디언)
- 문의 폼 (API 연동)
- 푸터

### 예약 페이지 (`/booking.html`)
- 4단계 위저드 (패키지 선택 → 요트 정보 → 날짜/시간 → 확인)
- 인터랙티브 캘린더 (과거/일요일 비활성화)
- 시간 슬롯 선택
- 실시간 견적 요약 사이드바
- 로그인 연동 예약 제출

### 인증 (`/login.html`, `/register.html`)
- 이메일/비밀번호 로그인
- 회원가입 (요트 정보 포함)
- JWT 토큰 인증 (Unicode-safe)
- 데모 계정 안내

### 고객 마이페이지 (`/dashboard.html`)
- 사이드바 네비게이션
- 대시보드: 통계 카드 + 다음 예약 + 최근 예약
- 예약 내역: 상태 필터 + 취소 기능
- 서비스 이력 테이블
- 정기 점검 카드
- 프로필 설정

### 관리자 대시보드 (`/admin.html`)
- 통계: 전체 예약/대기/고객/매출
- 오늘 일정 테이블
- 예약 관리: 상태 변경 모달
- 고객 관리 테이블
- 문의 관리 테이블
- DB 초기화 버튼

## 기술 스택
- **Frontend**: HTML/CSS/JS (Vanilla)
- **Backend**: Hono (Cloudflare Workers)
- **Database**: Cloudflare D1 (SQLite)
- **Auth**: JWT (Web Crypto API, Unicode-safe)
- **Deploy**: Cloudflare Pages

## 디자인 시스템
- Primary Navy: `#002D56` / `#061421`
- Accent Gold: `#C9A961` / `#D4AF37`
- 폰트: Montserrat + Noto Sans KR
- 카드 반경: 14px / 그림자: `0 4px 16px rgba(0,0,0,0.08)`

## 데모 계정
- **관리자**: admin@hyundaiyacht.com / Admin1234!
- **고객**: demo@hyundaiyacht.com / Demo1234!

## API 엔드포인트 요약

### 인증
- `POST /api/auth/login` - 로그인
- `POST /api/auth/register` - 회원가입
- `GET /api/auth/me` - 내 정보

### 예약
- `GET /api/bookings/packages` - 패키지 목록
- `GET /api/bookings/available-slots` - 예약 가능 슬롯
- `POST /api/bookings` - 예약 생성 (인증)
- `GET /api/bookings/my` - 내 예약 (인증)
- `DELETE /api/bookings/:id` - 예약 취소 (인증)

### 고객
- `GET /api/users/service-history` - 서비스 이력 (인증)
- `GET /api/users/maintenance` - 정기 점검 일정 (인증)
- `PUT /api/users/profile` - 프로필 수정 (인증)

### 관리자 (admin 권한 필요)
- `GET /api/admin/stats` - 통계
- `GET /api/admin/bookings` - 전체 예약
- `PATCH /api/admin/bookings/:id` - 예약 상태 변경
- `GET /api/admin/users` - 고객 목록
- `GET /api/admin/inquiries` - 문의 목록

### 기타
- `POST /api/init-db` - DB 초기화 (개발용)
- `POST /api/inquiries` - 문의 제출

## 로컬 실행
```bash
npm install
npm run build
npx wrangler d1 migrations apply hyundai-yacht-production --local
pm2 start ecosystem.config.cjs

# DB 초기화 (최초 1회)
curl -X POST http://localhost:3000/api/init-db
```

## 배포 (Cloudflare Pages)
```bash
# 1. Cloudflare API 키 설정
npx wrangler login

# 2. D1 DB 생성
npx wrangler d1 create hyundai-yacht-production
# (wrangler.jsonc의 database_id 업데이트)

# 3. 배포
npm run build
npx wrangler pages deploy dist --project-name hyundai-yacht-care
```

## 배포 현황
- **플랫폼**: Cloudflare Pages
- **상태**: 🔧 개발 중 (로컬 실행 가능)
- **마지막 업데이트**: 2025-03-17
