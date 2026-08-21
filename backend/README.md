# Urbanmenphoto Go Backend

Backend awal untuk API photobooth menggunakan Go standard library.

## Start

```bash
npm run backend:dev
```

Perintah tersebut menjalankan:

```bash
cd backend && go run ./cmd/api
```

Default URL:

```text
http://localhost:8788
```

Swagger UI:

```text
http://localhost:8788/swagger
```

OpenAPI spec:

```text
http://localhost:8788/swagger/openapi.yaml
```

## Environment

```bash
BACKEND_PORT=8788
BACKEND_HOST=127.0.0.1
PUBLIC_BASE_URL=http://localhost:8788
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5173
ADMIN_TOKEN_TTL_HOURS=12
PAYMENT_WEBHOOK_SECRET=secret-webhook-key
MIDTRANS_ENVIRONMENT=sandbox
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxx
MAX_BODY_BYTES=41943040
CLEANUP_INTERVAL_MINUTES=60
DATABASE_URL=
```

Frontend juga perlu client key untuk memuat Snap.js:

```bash
VITE_MIDTRANS_ENVIRONMENT=sandbox
VITE_MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxx
```

Admin pertama tidak ditaruh di `.env`. Buat admin lewat CLI supaya password langsung disimpan sebagai hash di database/storage:

```bash
npm run backend:admin -- -email admin@urbanmenphoto.com -role owner
```

Jika admin sudah ada dan password/role perlu direset:

```bash
npm run backend:admin -- -email admin@urbanmenphoto.com -role owner -force
```

Command tersebut akan meminta password di terminal. Setelah login sebagai owner, akun admin tambahan bisa dikelola lewat `GET/POST/PATCH/DELETE /api/admin/users`.

Login admin:

```http
POST /api/admin/auth/login
content-type: application/json

{
  "email": "admin@urbanmenphoto.com",
  "password": "change-this-strong-password"
}
```

Lalu kirim token dari response sebagai header:

```text
authorization: Bearer <admin-token>
```

Webhook payment bisa dikunci dengan:

```bash
export PAYMENT_WEBHOOK_SECRET=dev-webhook-secret
```

Lalu payment gateway/backend caller harus mengirim:

```text
x-webhook-secret: dev-webhook-secret
```

Untuk Midtrans Snap, isi `MIDTRANS_SERVER_KEY` di backend dan `VITE_MIDTRANS_CLIENT_KEY` di frontend. Pasang notification URL di dashboard Midtrans:

```text
http://localhost:8788/api/payments/midtrans/webhook
```

Saat production, ganti `PUBLIC_BASE_URL` dan notification URL ke domain publik backend, lalu set:

```bash
MIDTRANS_ENVIRONMENT=production
VITE_MIDTRANS_ENVIRONMENT=production
```

Proteksi dasar yang sudah aktif:

- Rate limit per IP untuk login admin, create payment, payment webhook, dan send link.
- Limit request body lewat `MAX_BODY_BYTES`.
- Validasi email, phone, channel, provider, currency, amount, status payment, dan upload foto.
- Upload/finalisasi foto statis hanya menerima data URL `image/jpeg`, `image/png`, atau `image/webp`, maksimal 16 foto mentah dan 8 MB per image setelah decode.
- Hasil bergerak customer disimpan sebagai `animatedImage` dan menerima data URL `image/gif`, `image/jpeg`, `image/png`, atau `image/webp`.
- Admin route wajib memakai bearer token hasil login email/password.
- Customer session route sensitif wajib memakai `x-session-token` dari response `POST /api/sessions`.
- CORS dibatasi via `ALLOWED_ORIGINS`.
- Security headers aktif.
- Admin token disimpan sebagai SHA-256 hash, bukan token mentah.
- Customer session token disimpan sebagai SHA-256 hash, bukan token mentah.
- Audit log admin, customer session, customer payment, dan payment webhook tersimpan.
- Login lockout setelah gagal berulang.
- Retention session/gallery fixed 7 hari. Setelah expired, API gallery dan file `/files/sessions/...` tidak bisa diakses lagi.
- Cleanup otomatis menghapus session/file expired sesuai `CLEANUP_INTERVAL_MINUTES` (`0` untuk disable).

## PostgreSQL

Backend otomatis memakai PostgreSQL jika `DATABASE_URL` terisi. Semua query PostgreSQL memakai parameter `$1`, `$2`, dan seterusnya.

Jalankan database lokal:

```bash
cd backend
docker compose up -d
```

Isi `.env`:

```bash
DATABASE_URL=postgres://urbanmen:urbanmen_dev_password@localhost:5432/urbanmenphoto?sslmode=disable
```

Lalu jalankan backend:

```bash
go run ./cmd/api
```

Schema akan dibuat otomatis dari:

```text
backend/migrations/001_initial_schema.sql
```

## Endpoints

```text
GET /health
GET /swagger
GET /swagger/openapi.yaml
GET /api/galleries/:sessionId
POST /api/sessions
GET /api/sessions/:id
PATCH /api/sessions/:id
POST /api/sessions/:id/finalize
POST /api/sessions/:id/send-link
POST /api/sessions/:id/expire
POST /api/payments
GET /api/payments/:id
POST /api/payments/:id/webhook
POST /api/payments/midtrans/webhook
GET /api/frames
GET /api/admin/sessions
GET /api/admin/sessions/:id
GET /api/admin/stats
DELETE /api/admin/sessions/:id
POST /api/admin/auth/login
POST /api/admin/auth/logout
GET /api/admin/auth/me
GET /api/admin/users
POST /api/admin/users
PATCH /api/admin/users/:id
DELETE /api/admin/users/:id
GET /api/admin/messages
GET /api/admin/payments
GET /api/admin/payment-logs
GET /api/admin/transactions
GET /api/admin/audit-logs
POST /api/admin/cleanup
GET /api/admin/frames
POST /api/admin/frames
PUT /api/admin/frames/:id
DELETE /api/admin/frames/:id
```

`POST /api/sessions` mengembalikan `customerToken` satu kali. Kirim token tersebut sebagai header:

```text
x-session-token: <customer-token>
```

Header ini wajib untuk `GET/PATCH /api/sessions/:id`, `POST /api/sessions/:id/finalize`, `POST /api/sessions/:id/send-link`, `POST /api/sessions/:id/expire`, dan `POST /api/payments`.

## Data Lokal

Metadata sesi sementara:

```text
backend/data/db.json
```

File foto sementara:

```text
backend/storage/sessions/:sessionId
```

Ini sengaja untuk pondasi lokal dulu. Saat database production siap, layer `backend/internal/store` bisa diganti ke PostgreSQL. Draft schema PostgreSQL tersedia di:

```text
backend/migrations/001_initial_schema.sql
```
