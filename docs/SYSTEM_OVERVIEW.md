# Logi-Pro (QD209) — Tổng Quan Hệ Thống & API Reference

> **Phiên bản tài liệu:** 2026-04-06  
> **Mục đích:** Mô tả kiến trúc, database schema, API routes để chương trình bên ngoài có thể tích hợp & lấy dữ liệu.

---

## Mục Lục

1. [Tổng Quan](#1-tổng-quan)
2. [Kiến Trúc Hệ Thống](#2-kiến-trúc-hệ-thống)
3. [Backend](#3-backend)
4. [Frontend](#4-frontend)
5. [Database Schema](#5-database-schema)
6. [API Routes — Tham Chiếu Đầy Đủ](#6-api-routes--tham-chiếu-đầy-đủ)
7. [Xác Thực (Authentication)](#7-xác-thực-authentication)
8. [Hướng Dẫn Tích Hợp Từ Bên Ngoài](#8-hướng-dẫn-tích-hợp-từ-bên-ngoài)
9. [Cấu Trúc Dữ Liệu (TypeScript Interfaces)](#9-cấu-trúc-dữ-liệu-typescript-interfaces)
10. [Deployment](#10-deployment)

---

## 1. Tổng Quan

**Logi-Pro** là ứng dụng quản lý vận tải & logistics, bao gồm:

| Module | Chức năng |
|--------|-----------|
| **Dashboard** | Hiển thị giá dầu DO hiện hành, biểu đồ biến động giá |
| **Surcharge Calculator** | Tính phụ thu nhiên liệu container (20F/40F/20E/40E) và hàng rời (bulk) theo bảng bậc thang |
| **Quotation** | Lập báo giá dịch vụ vận tải, xuất PDF/A4 |
| **Reconciliation** | Đối soát phụ thu nhiên liệu giữa ngày booking và ngày thực hiện (import Excel) |
| **Customer Management** | Quản lý danh sách khách hàng |
| **Service Catalog** | Danh mục dịch vụ & đơn giá |
| **Service Registration** | Đăng ký phương án bốc xếp |
| **Admin Panel** | Quản lý users, giá dầu, bảng phụ thu, cấu hình fallback, audit log |
| **Fuel Price Scraper** | Tự động cào giá dầu từ Petrolimex hàng ngày (cron 6:00 AM VN) |

---

## 2. Kiến Trúc Hệ Thống

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT (Browser)                        │
│  React 19 + TailwindCSS 4 + Vite 6                         │
│  SPA — các module: Dashboard, Calculator, Quotation, ...    │
└────────────────────────┬────────────────────────────────────┘
                         │  HTTP REST (JSON)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  BACKEND (Express 4)                         │
│  Runtime: Node.js + tsx (TypeScript trực tiếp)              │
│  Port: 3000 (mặc định)                                     │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ /api/auth│  │ /api/*   │  │ /api/*   │                  │
│  │ (auth.ts)│  │(crud.ts) │  │(sync.ts) │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
│       │              │              │                        │
│       ▼              ▼              ▼                        │
│  ┌──────────────────────────────────────┐                   │
│  │           db.ts (switch)             │                   │
│  │   ┌─────────────┐ ┌──────────────┐  │                   │
│  │   │ db-memory.ts│ │db-postgres.ts│  │                   │
│  │   │ (dev/test)  │ │ (production) │  │                   │
│  │   └─────────────┘ └──────────────┘  │                   │
│  └──────────────────────────────────────┘                   │
│                                                             │
│  ┌──────────────────────────────┐                           │
│  │  Petrolimex Scraper (cron)  │                           │
│  │  Cào giá dầu DO 6:00 AM VN │                           │
│  └──────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL 16 (Production)                      │
│              hoặc In-Memory Store (Dev)                      │
│              Database: logipro                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Backend

### 3.1 Tech Stack

| Thành phần | Công nghệ |
|------------|-----------|
| Runtime | Node.js + `tsx` (TypeScript trực tiếp, không cần build) |
| Framework | Express 4 |
| Validation | Zod |
| Auth | bcryptjs (hash password) + HMAC-SHA256 token |
| Database Driver | `pg` (node-postgres) |
| Scraper | axios + cheerio (cào Petrolimex) |
| Process Manager | PM2 (`ecosystem.config.cjs`) |

### 3.2 Cấu Trúc Thư Mục Backend

```
backend/
├── server.ts          — Entry point, bootstrap, daily scheduler
├── config.ts          — PORT, DATABASE_URL, token helper, fallback config, audit log
├── schemas.ts         — Zod schemas cho request validation
├── db.ts              — Switch module: chọn db-memory hoặc db-postgres
├── db-memory.ts       — In-memory store (dev/test)
├── db-postgres.ts     — PostgreSQL adapter
├── schema.sql         — DDL tạo bảng (14 tables)
├── seed.ts            — Seed dữ liệu mặc định (admin user, tiers, services, ...)
├── routes/
│   ├── auth.ts        — Đăng nhập, verify token, CRUD users
│   ├── crud.ts        — Generic CRUD cho tất cả bảng dữ liệu
│   └── sync.ts        — Health check, fallback config, Petrolimex scraper endpoints
├── scrapers/
│   └── petrolimex.ts  — Scraper cào giá dầu Petrolimex (cache 6h)
└── utils/
    └── vietnamTime.ts — Helper múi giờ Việt Nam (UTC+7)
```

### 3.3 Chế Độ Chạy

| Chế độ | Cách chạy | Đặc điểm |
|--------|-----------|----------|
| **Dev** | `npm run dev` | Vite dev server middleware, HMR, in-memory DB |
| **Production** | `npm start` hoặc PM2 | Serve static `frontend/dist/`, PostgreSQL |

---

## 4. Frontend

### 4.1 Tech Stack

| Thành phần | Công nghệ |
|------------|-----------|
| UI Library | React 19 |
| Styling | TailwindCSS 4 |
| Build Tool | Vite 6 |
| Charts | Recharts |
| PDF Export | jspdf + html2canvas |
| Excel I/O | exceljs, xlsx |
| Icons | lucide-react |
| Animation | motion (framer-motion) |
| i18n | i18next + react-i18next |

### 4.2 Cấu Trúc Modules

```
frontend/src/
├── App.tsx                         — Root component, routing tabs, login modal
├── main.tsx                        — React entry point
├── context/AppContext.tsx           — Global state (prices, tiers, customers, ...)
├── lib/
│   ├── apiBase.ts                  — API base URL (dev: '', prod: '/QD209')
│   ├── storage.ts                  — StorageService class — giao tiếp REST API
│   ├── fuelPrices.ts               — Helpers: tính giá dầu hiệu lực, format ngày VN
│   ├── reconciliation.ts           — Logic đối soát phụ thu (import Excel, tính delta)
│   └── utils.ts                    — Các helper chung
├── components/
│   ├── Dashboard.tsx               — Trang chủ: giá dầu, biểu đồ
│   ├── SurchargeCalculator.tsx     — Tính phụ thu nhiên liệu
│   ├── QuotationModule.tsx         — Lập báo giá
│   ├── ReconciliationModule.tsx    — Đối soát phụ thu
│   ├── CustomerList.tsx            — Quản lý khách hàng
│   ├── ServiceCatalog.tsx          — Danh mục dịch vụ
│   ├── ServiceRegistrationModule.tsx — Đăng ký phương án
│   ├── AdminPanel.tsx              — Quản trị hệ thống
│   ├── History.tsx                 — Lịch sử báo giá
│   ├── Sidebar.tsx                 — Menu điều hướng
│   └── quotation/                  — Sub-components cho module báo giá
├── types/index.ts                  — TypeScript interfaces
├── hooks/                          — Custom React hooks
├── styles/                         — Style modules (inline CSS-in-JS)
└── constants/                      — Constants (quotation translations)
```

### 4.3 Base URL

| Môi trường | `BASE_URL` | API call |
|------------|------------|----------|
| Dev | `/` | `fetch('/api/prices')` |
| Production | `/QD209/` | `fetch('/QD209/api/prices')` |

---

## 5. Database Schema

**14 bảng** — PostgreSQL (hoặc in-memory tương đương khi dev).

### 5.1 ERD Tóm Tắt

```
users ─────────────────────────────────────
fuel_prices ───────────────────────────────
tiers ─────────────────────────────────────
bulk_tiers ────────────────────────────────
customers ─────────────────────────────────
services ──────────────────────────────────
quotations ──┬── quotation_items (1:N)
             └─────────────────────────────
reconciliation_logs ───────────────────────
registration_services ─────────────────────
registrations ──┬── registration_items (1:N)
                └──────────────────────────
audit_logs ────────────────────────────────
app_config ────────────────────────────────
```

### 5.2 Chi Tiết Từng Bảng

#### `users` — Người dùng & phân quyền

| Column | Type | Mô tả |
|--------|------|-------|
| `id` | SERIAL PK | |
| `username` | VARCHAR(50) UNIQUE | Tên đăng nhập |
| `password_hash` | VARCHAR(255) | bcrypt hash |
| `display_name` | VARCHAR(100) | Tên hiển thị |
| `role` | VARCHAR(20) | `admin` \| `thuongvu` \| `guest` |
| `created_at` | TIMESTAMPTZ | |

#### `fuel_prices` — Giá nhiên liệu (Dầu DO)

| Column | Type | Mô tả |
|--------|------|-------|
| `id` | SERIAL PK | |
| `date` | DATE UNIQUE | Ngày hiệu lực |
| `fuel_type` | VARCHAR(50) | Mặc định: `Dầu DO 0,05S-II` |
| `price_v1` | INTEGER | Giá (VND), ví dụ: `35440` = 35.440đ |
| `is_published` | BOOLEAN | Đánh dấu giá được ghim trên Dashboard |
| `effective_at` | TEXT | Thời điểm hiệu lực (ISO datetime) |

#### `tiers` — Bảng bậc thang phụ thu container

| Column | Type | Mô tả |
|--------|------|-------|
| `id` | SERIAL PK | |
| `min_price` | INTEGER | Giá dầu tối thiểu (VND) |
| `max_price` | INTEGER | Giá dầu tối đa (VND) |
| `surcharge_20f` | INTEGER | Phụ thu cont 20' Full (VND) |
| `surcharge_40f` | INTEGER | Phụ thu cont 40' Full (VND) |
| `surcharge_20e` | INTEGER | Phụ thu cont 20' Empty (VND) |
| `surcharge_40e` | INTEGER | Phụ thu cont 40' Empty (VND) |

**Ví dụ:** Giá dầu 35.001–38.000đ → Phụ thu 20F = 250.000đ, 40F = 300.000đ

#### `bulk_tiers` — Bảng bậc thang phụ thu hàng rời

| Column | Type | Mô tả |
|--------|------|-------|
| `id` | SERIAL PK | |
| `min_price` | INTEGER | Giá dầu tối thiểu |
| `max_price` | INTEGER | Giá dầu tối đa |
| `percent_surcharge` | NUMERIC(5,2) | Phần trăm phụ thu (ví dụ: 15 = 15%) |

#### `customers` — Khách hàng

| Column | Type | Mô tả |
|--------|------|-------|
| `id` | SERIAL PK | |
| `name` | VARCHAR(255) | Tên công ty |
| `email` | VARCHAR(255) | |
| `phone` | VARCHAR(50) | |
| `address` | TEXT | |
| `tax_code` | VARCHAR(20) | Mã số thuế |
| `status` | VARCHAR(10) | `active` \| `inactive` |

#### `services` — Danh mục dịch vụ

| Column | Type | Mô tả |
|--------|------|-------|
| `id` | SERIAL PK | |
| `name` | VARCHAR(255) | Tên dịch vụ |
| `unit` | VARCHAR(20) | Đơn vị (Cont, Tấn, Chuyến, ...) |
| `price` | INTEGER | Đơn giá (VND) |
| `category` | VARCHAR(50) | Phân loại (Container, Vận tải) |

#### `quotations` — Báo giá (header)

| Column | Type | Mô tả |
|--------|------|-------|
| `id` | SERIAL PK | |
| `quotation_no` | VARCHAR(50) | Số báo giá (VD: `BG-2026-001`) |
| `customer_name` | VARCHAR(255) | Tên khách hàng |
| `date` | DATE | Ngày lập |
| `total` | BIGINT | Tổng tiền (VND) |
| `status` | VARCHAR(10) | `draft` \| `sent` \| `accepted` \| `rejected` |
| `created_by` | VARCHAR(50) | Người lập |

#### `quotation_items` — Chi tiết báo giá

| Column | Type | Mô tả |
|--------|------|-------|
| `id` | SERIAL PK | |
| `quotation_id` | INTEGER FK → quotations | |
| `name` | VARCHAR(255) | Tên dịch vụ |
| `unit` | VARCHAR(20) | Đơn vị |
| `quantity` | INTEGER | Số lượng |
| `price` | INTEGER | Đơn giá |
| `total` | BIGINT | Thành tiền |
| `note` | TEXT | Ghi chú |

#### `reconciliation_logs` — Nhật ký đối soát phụ thu

| Column | Type | Mô tả |
|--------|------|-------|
| `id` | SERIAL PK | |
| `container_id` | VARCHAR(20) | Số container |
| `container_type` | VARCHAR(5) | `20F`/`40F`/`20E`/`40E` |
| `booking_date` | DATE | Ngày làm lệnh |
| `check_date` | DATE | Ngày đối soát |
| `fuel_price_at_booking` | INTEGER | Giá dầu tại ngày booking |
| `fuel_price_now` | INTEGER | Giá dầu tại ngày đối soát |
| `surcharge_at_booking` | INTEGER | Phụ thu lúc booking |
| `surcharge_now` | INTEGER | Phụ thu hiện tại |
| `delta` | INTEGER | Chênh lệch phụ thu (VND) |
| `status` | VARCHAR(10) | `increase`/`decrease`/`same` |
| `note` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

#### `registration_services` — Danh mục dịch vụ đăng ký

| Column | Type | Mô tả |
|--------|------|-------|
| `id` | SERIAL PK | |
| `name` | VARCHAR(255) | Tên phương án |
| `unit` | VARCHAR(20) | Đơn vị |

#### `registrations` — Phiếu đăng ký phương án (header)

| Column | Type | Mô tả |
|--------|------|-------|
| `id` | SERIAL PK | |
| `registration_number` | VARCHAR(50) | Số phiếu |
| `registration_date` | DATE | Ngày đăng ký |
| `customer_name` | VARCHAR(255) | |
| `customer_address` | TEXT | |
| `customer_phone` | VARCHAR(50) | |
| `working_date` | DATE | Ngày thực hiện |
| `cargo_type` | VARCHAR(50) | Loại hàng |
| `container_type` | VARCHAR(50) | Loại container |
| `customer_notes` | TEXT | Ghi chú |
| `created_at` | TIMESTAMPTZ | |

#### `registration_items` — Chi tiết phiếu đăng ký

| Column | Type | Mô tả |
|--------|------|-------|
| `id` | SERIAL PK | |
| `registration_id` | INTEGER FK → registrations | |
| `service_name` | VARCHAR(255) | Tên phương án |
| `size` | VARCHAR(10) | Kích thước (20', 40', 45') |
| `quantity` | INTEGER | Số lượng |

#### `audit_logs` — Nhật ký kiểm soát

| Column | Type | Mô tả |
|--------|------|-------|
| `id` | SERIAL PK | |
| `action` | VARCHAR(100) | Hành động (VD: `ADMIN_PRICE`, `SYNC_PRICES`) |
| `details` | TEXT | Chi tiết |
| `timestamp` | TIMESTAMPTZ | |

#### `app_config` — Cấu hình hệ thống (key-value)

| Column | Type | Mô tả |
|--------|------|-------|
| `key` | VARCHAR(50) PK | Tên config (VD: `fallback`) |
| `value` | JSONB | Giá trị JSON |

**Config mặc định:**
```json
{ "key": "fallback", "value": { "price": 35440, "date": "2026-03-26" } }
```

---

## 6. API Routes — Tham Chiếu Đầy Đủ

**Base URL:** `http://<host>:3000` (dev) hoặc `https://<domain>/QD209` (production)

### 6.1 Health & System

| Method | Route | Auth | Mô tả | Response |
|--------|-------|------|-------|----------|
| GET | `/api/health` | ❌ | Kiểm tra trạng thái server + DB | `{ status: "UP", storage: "POSTGRESQL"/"MEMORY", timestamp }` |

### 6.2 Authentication (`/api/auth/`)

| Method | Route | Auth | Mô tả | Request Body | Response |
|--------|-------|------|-------|-------------|----------|
| POST | `/api/auth/login` | ❌ | Đăng nhập | `{ username, password }` | `{ success, token, role, displayName }` |
| GET | `/api/auth/verify` | 🔑 Bearer | Xác thực token | — | `{ success, username, role, displayName }` |
| GET | `/api/auth/users` | 🔑 Admin | Lấy danh sách users | — | `{ success, data: User[] }` |
| POST | `/api/auth/users` | 🔑 Admin | Tạo user mới | `{ username, password, displayName, role }` | `{ success, message }` |
| PUT | `/api/auth/users/:id` | 🔑 Admin | Cập nhật user | `{ displayName, role, password? }` | `{ success, message }` |
| DELETE | `/api/auth/users/:id` | 🔑 Admin | Xóa user | — | `{ success, message }` |

### 6.3 Fuel Prices (`/api/prices*`)

| Method | Route | Auth | Mô tả | Request Body | Response |
|--------|-------|------|-------|-------------|----------|
| GET | `/api/prices` | ❌ | Lấy tất cả giá dầu | — | `{ success, data: FuelPrice[] }` |
| POST | `/api/prices` | 🔑 | Ghi đè toàn bộ bảng giá | `FuelPrice[]` | `{ success }` |
| POST | `/api/prices/upsert` | 🔑 | Thêm/cập nhật 1 giá theo date | `{ date, fuelType?, priceV1 }` | `{ success, id, message }` |
| PUT | `/api/prices/:id` | 🔑 | Sửa giá theo ID | `{ priceV1 }` | `{ success, message }` |
| PUT | `/api/prices/:id/publish` | 🔑 | Ghim giá lên Dashboard | — | `{ success, message }` |
| DELETE | `/api/prices/publish` | 🔑 | Bỏ ghim — dùng giá mới nhất | — | `{ success, message }` |

### 6.4 Surcharge Tiers

| Method | Route | Auth | Mô tả | Response |
|--------|-------|------|-------|----------|
| GET | `/api/tiers` | ❌ | Bảng bậc thang phụ thu container | `{ success, data: Tier[] }` |
| POST | `/api/tiers` | 🔑 | Ghi đè bảng tiers | `{ success }` |
| GET | `/api/bulk-tiers` | ❌ | Bảng bậc thang phụ thu hàng rời | `{ success, data: BulkTier[] }` |
| POST | `/api/bulk-tiers` | 🔑 | Ghi đè bảng bulk_tiers | `{ success }` |

### 6.5 Customers

| Method | Route | Auth | Mô tả | Response |
|--------|-------|------|-------|----------|
| GET | `/api/customers` | 🔑 | Danh sách khách hàng | `{ success, data: Customer[] }` |
| POST | `/api/customers` | 🔑 | Ghi đè danh sách | `{ success }` |

### 6.6 Services / Products

| Method | Route | Auth | Mô tả | Response |
|--------|-------|------|-------|----------|
| GET | `/api/services` | ❌ | Danh mục dịch vụ | `{ success, data: Product[] }` |
| POST | `/api/services` | 🔑 | Ghi đè danh mục | `{ success }` |

### 6.7 Quotations

| Method | Route | Auth | Mô tả | Response |
|--------|-------|------|-------|----------|
| GET | `/api/quotations` | 🔑 | Danh sách báo giá | `{ success, data: Quotation[] }` |
| POST | `/api/quotations` | 🔑 | Ghi đè danh sách | `{ success }` |

### 6.8 Reconciliation

| Method | Route | Auth | Mô tả | Response |
|--------|-------|------|-------|----------|
| GET | `/api/reconciliation-logs` | 🔑 | Nhật ký đối soát | `{ success, data: ReconciliationLog[] }` |
| POST | `/api/reconciliation-logs` | 🔑 | Ghi đè nhật ký | `{ success }` |

### 6.9 Registrations

| Method | Route | Auth | Mô tả | Response |
|--------|-------|------|-------|----------|
| GET | `/api/registration-services` | ❌ | Danh mục dịch vụ đăng ký | `{ success, data }` |
| POST | `/api/registration-services` | 🔑 | Ghi đè danh mục | `{ success }` |
| GET | `/api/registrations` | 🔑 | Danh sách phiếu đăng ký | `{ success, data }` |
| POST | `/api/registrations` | 🔑 | Ghi đè danh sách | `{ success }` |

### 6.10 Audit Logs

| Method | Route | Auth | Mô tả | Response |
|--------|-------|------|-------|----------|
| GET | `/api/audit` | 🔑 | Nhật ký kiểm soát | `{ success, data: AuditLog[] }` |

### 6.11 Petrolimex Scraper & Sync

| Method | Route | Auth | Mô tả | Response |
|--------|-------|------|-------|----------|
| GET | `/api/petrolimex-sync` | ❌ | Cào giá mới nhất (không lưu DB) | `{ success, data: { fuelType, priceV1, date, source, ... } }` |
| POST | `/api/petrolimex-sync` | 🔑 | Cào giá + lưu vào DB | `{ success, data }` |
| POST | `/api/petrolimex-sync/clear-cache` | 🔑 | Xóa cache scraper (force refresh) | `{ success, message }` |
| GET | `/api/cron/sync` | 🔑 CRON_SECRET | Trigger sync từ bên ngoài (cron job) | `{ success, data }` |

### 6.12 Fallback Config

| Method | Route | Auth | Mô tả | Request Body | Response |
|--------|-------|------|-------|-------------|----------|
| GET | `/api/fallback` | ❌ | Lấy giá dự phòng (khi scraper fail) | — | `{ success, data: { price, date } }` |
| POST | `/api/fallback` | 🔑 | Cập nhật giá dự phòng | `{ price: number, date: "YYYY-MM-DD" }` | `{ success, message }` |

---

## 7. Xác Thực (Authentication)

### 7.1 Flow

```
Client                          Server
  │                               │
  │ POST /api/auth/login          │
  │ { username, password }  ────► │ bcrypt.compare(password, hash)
  │                               │ token = HMAC-SHA256(username, hash)
  │ ◄──── { token, role }        │
  │                               │
  │ GET /api/prices               │
  │ Authorization: Bearer <token> │
  │ ──────────────────────────► │ Verify token in activeTokens map
  │ ◄──── { data: [...] }       │
```

### 7.2 Cách Gửi Token

```
Authorization: Bearer <token>
```

### 7.3 Roles & Permissions

| Role | Mô tả | Quyền |
|------|-------|-------|
| `admin` | Quản trị viên | Toàn quyền: CRUD users, giá, tiers, customers, quotations |
| `thuongvu` | Nhân viên thương vụ | Xem + sửa dữ liệu nghiệp vụ (không quản lý users) |
| `guest` | Khách | Chỉ xem dữ liệu công khai (prices, tiers, services) |

### 7.4 Public vs Protected Routes

**Không cần auth (public):**
- `GET /api/health`
- `GET /api/prices`
- `GET /api/tiers`
- `GET /api/bulk-tiers`
- `GET /api/services`
- `GET /api/registration-services`
- `GET /api/fallback`
- `GET /api/petrolimex-sync`

**Cần Bearer token:**
- Tất cả `POST`, `PUT`, `DELETE`
- `GET /api/customers`
- `GET /api/quotations`
- `GET /api/registrations`
- `GET /api/reconciliation-logs`
- `GET /api/audit`

---

## 8. Hướng Dẫn Tích Hợp Từ Bên Ngoài

### 8.1 Lấy Giá Dầu Hiện Hành (Không Cần Login)

```bash
# Lấy toàn bộ lịch sử giá dầu
curl http://localhost:3000/api/prices

# Response:
{
  "success": true,
  "data": [
    {
      "id": 1,
      "date": "2026-04-04",
      "fuelType": "Dầu DO 0,05S-II",
      "priceV1": 44780,
      "isPublished": true,
      "effectiveAt": "2026-04-04T08:00:00+07:00"
    },
    ...
  ]
}
```

**Tip:** Giá mới nhất = item cuối cùng khi sort theo `date` DESC. Hoặc tìm item có `isPublished: true`.

### 8.2 Lấy Bảng Phụ Thu (Không Cần Login)

```bash
# Bảng phụ thu container
curl http://localhost:3000/api/tiers

# Bảng phụ thu hàng rời
curl http://localhost:3000/api/bulk-tiers
```

### 8.3 Tính Phụ Thu Tự Động (Logic)

```javascript
// Pseudo-code tính phụ thu container
function getSurcharge(fuelPrice, containerType, tiers) {
  const tier = tiers.find(t => fuelPrice >= t.minPrice && fuelPrice <= t.maxPrice);
  if (!tier) return 0;
  
  const surchargeMap = {
    '20F': tier.surcharge20F,
    '40F': tier.surcharge40F,
    '20E': tier.surcharge20E,
    '40E': tier.surcharge40E,
  };
  return surchargeMap[containerType] || 0;
}

// Pseudo-code tính phụ thu hàng rời
function getBulkSurcharge(fuelPrice, freightAmount, bulkTiers) {
  const tier = bulkTiers.find(t => fuelPrice >= t.minPrice && fuelPrice <= t.maxPrice);
  if (!tier) return 0;
  return Math.round(freightAmount * tier.percentSurcharge / 100);
}
```

### 8.4 Login & Lấy Dữ Liệu Protected

```bash
# 1. Đăng nhập
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin@@@@"}' | jq -r '.token')

# 2. Lấy danh sách khách hàng (cần auth)
curl http://localhost:3000/api/customers \
  -H "Authorization: Bearer $TOKEN"

# 3. Lấy báo giá
curl http://localhost:3000/api/quotations \
  -H "Authorization: Bearer $TOKEN"
```

### 8.5 Scraper — Cào Giá Dầu Mới Nhất

```bash
# Chỉ đọc (không lưu DB) — không cần auth
curl http://localhost:3000/api/petrolimex-sync

# Cào + lưu DB — cần auth
curl -X POST http://localhost:3000/api/petrolimex-sync \
  -H "Authorization: Bearer $TOKEN"
```

### 8.6 Cron External Trigger

```bash
# Trigger sync từ cron job bên ngoài
curl http://localhost:3000/api/cron/sync \
  -H "Authorization: Bearer logipro_cron_2026"
```

> **Lưu ý:** CRON_SECRET mặc định = `logipro_cron_2026`, có thể đổi qua env var `CRON_SECRET`.

### 8.7 Ví Dụ Tích Hợp Bằng Python

```python
import requests

BASE_URL = "http://localhost:3000"

# --- Public APIs (không cần login) ---

# Lấy giá dầu
prices = requests.get(f"{BASE_URL}/api/prices").json()["data"]
latest_price = sorted(prices, key=lambda p: p["date"], reverse=True)[0]
print(f"Giá dầu mới nhất: {latest_price['priceV1']:,}đ ({latest_price['date']})")

# Lấy bảng phụ thu
tiers = requests.get(f"{BASE_URL}/api/tiers").json()["data"]
bulk_tiers = requests.get(f"{BASE_URL}/api/bulk-tiers").json()["data"]

# Tính phụ thu cho container 20F
fuel_price = latest_price["priceV1"]
tier = next((t for t in tiers if t["minPrice"] <= fuel_price <= t["maxPrice"]), None)
surcharge_20f = tier["surcharge20F"] if tier else 0
print(f"Phụ thu 20F: {surcharge_20f:,}đ")

# --- Protected APIs (cần login) ---

# Login
login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
    "username": "admin",
    "password": "admin@@@@"
})
token = login_res.json()["token"]
headers = {"Authorization": f"Bearer {token}"}

# Lấy khách hàng
customers = requests.get(f"{BASE_URL}/api/customers", headers=headers).json()["data"]

# Lấy báo giá
quotations = requests.get(f"{BASE_URL}/api/quotations", headers=headers).json()["data"]
```

### 8.8 Ví Dụ Tích Hợp Bằng JavaScript/Node.js

```javascript
const BASE_URL = "http://localhost:3000";

// --- Public ---
const pricesRes = await fetch(`${BASE_URL}/api/prices`);
const { data: prices } = await pricesRes.json();
const latestPrice = prices.sort((a, b) => b.date.localeCompare(a.date))[0];

const tiersRes = await fetch(`${BASE_URL}/api/tiers`);
const { data: tiers } = await tiersRes.json();

// --- Protected ---
const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "admin", password: "admin@@@@" }),
});
const { token } = await loginRes.json();

const customersRes = await fetch(`${BASE_URL}/api/customers`, {
  headers: { Authorization: `Bearer ${token}` },
});
const { data: customers } = await customersRes.json();
```

---

## 9. Cấu Trúc Dữ Liệu (TypeScript Interfaces)

```typescript
interface FuelPrice {
  id: string;
  date: string;            // "YYYY-MM-DD"
  effectiveAt?: string;    // ISO datetime
  fuelType: string;        // "Dầu DO 0,05S-II"
  priceV1: number;         // VND (integer)
  isPublished?: boolean;
}

interface Tier {
  id: string;
  minPrice: number;
  maxPrice: number;
  surcharge20F: number;    // VND
  surcharge40F: number;
  surcharge20E: number;
  surcharge40E: number;
}

interface BulkTier {
  id: string;
  minPrice: number;
  maxPrice: number;
  percentSurcharge: number; // % (VD: 15 = 15%)
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  taxCode: string;
  status: 'active' | 'inactive';
}

interface Product {
  id?: string;
  name: string;
  unit: string;
  price: number;
  category?: string;
}

interface QuotationHistoryItem {
  id: string;
  quotationNo: string;
  customerName: string;
  date: string;
  total: number;
  status: 'draft' | 'sent' | 'accepted' | 'rejected';
  createdBy: string;
  items?: QuotationItem[];
}

interface QuotationItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  price: number;
  total: number;
  note?: string;
}

interface ReconciliationLog {
  id: string;
  containerId: string;
  containerType: '20F' | '40F' | '20E' | '40E' | 'bulk';
  bookingDate: string;
  checkDate: string;
  fuelPriceAtBooking: number;
  fuelPriceNow: number;
  surchargeAtBooking: number;
  surchargeNow: number;
  delta: number;
  status: 'increase' | 'decrease' | 'same';
  note?: string;
  createdAt: string;
}

interface RegistrationServiceItem {
  id: string;
  name: string;
  unit: string;
}

interface RegistrationHistoryItem {
  id: string;
  registrationNumber: string;
  registrationDate: string;
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  workingDate: string;
  cargoType: string;
  containerType: string;
  customerNotes: string;
  items: RegistrationLineItem[];
  createdAt: string;
}

interface RegistrationLineItem {
  id: string;
  serviceName: string;
  size: string;         // "20'", "40'", "45'"
  quantity: number;
}

interface AuditLog {
  id: string;
  action: string;
  details: string;
  timestamp: string;
}
```

---

## 10. Deployment

### 10.1 Môi Trường

| Env | Cách chạy | Database | Port |
|-----|-----------|----------|------|
| Development | `npm run dev` | In-Memory | 3000 |
| Production | PM2 + Nginx | PostgreSQL | 3000 (internal) |

### 10.2 Environment Variables

| Variable | Mặc định | Mô tả |
|----------|---------|-------|
| `PORT` | `3000` | Port Express server |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/logipro` | Connection string PostgreSQL |
| `NODE_ENV` | — | `production` để serve static frontend |
| `CRON_SECRET` | `logipro_cron_2026` | Secret cho endpoint `/api/cron/sync` |

### 10.3 PM2 Config

```javascript
// ecosystem.config.cjs
{
  name: 'qd209',
  script: 'backend/server.ts',
  interpreter: 'node',
  interpreter_args: '--import tsx',
  env: {
    NODE_ENV: 'production',
    PORT: 3000,
    DATABASE_URL: 'postgresql://qd209:***@localhost:5432/logipro'
  }
}
```

### 10.4 Nginx (Reverse Proxy)

Production URL: `https://<domain>/QD209/` → proxy pass → `http://localhost:3000/`

---

## Phụ Lục: Sơ Đồ Luồng Dữ Liệu Chính

```
[Petrolimex Website]
        │ (cào HTML, parse giá DO)
        ▼
[Scraper Cache (6h)] ──► GET /api/petrolimex-sync (read-only)
        │
        ▼ (POST /api/petrolimex-sync hoặc cron 6:00 AM)
[fuel_prices table]
        │
        ├──► GET /api/prices (public) ──► Dashboard (hiển thị giá)
        │                              ──► External App (lấy giá)
        │
        ├──► [tiers table] + giá dầu ──► SurchargeCalculator
        │                              ──► ReconciliationModule
        │
        └──► [fallback config] ──► Giá dự phòng khi scraper fail

[customers] ◄──► QuotationModule
[services]  ◄──► QuotationModule, ServiceCatalog
[quotations + items] ◄──► QuotationModule, History
[registrations + items] ◄──► ServiceRegistrationModule
[reconciliation_logs] ◄──► ReconciliationModule
[audit_logs] ◄── Ghi tự động khi có thao tác admin
```
