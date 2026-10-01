# spectit.md — Jiwalu Photo (Urbanmenphoto Photobooth) Spec

Acuan untuk AI/engineer yang kerja di repo ini. Dokumen ini hasil analisa kode existing (bukan rencana baru) — tujuannya supaya perubahan berikutnya (termasuk modernisasi UI/UX) **tidak merusak flow bisnis yang sudah jalan**.

> Status: snapshot per 2026-10-01, branch `dev`. Kode hardware agent lama (gphoto/camera-agent/printer, file Go terpisah) sudah DIHAPUS di working tree — jangan dibangun ulang kecuali diminta eksplisit.

---

## 1. Apa produk ini

Aplikasi photobooth kiosk (self-service) + dashboard admin, untuk event/studio foto cetak instan. Dua permukaan:

- **Kiosk app** (`src/App.jsx`, root `/`) — dipakai tamu/customer di layar sentuh venue.
- **Admin dashboard** (`src/components/AdminDashboard.jsx`, route `/admin`) — dipakai owner/admin kelola frame, voucher, keuangan, project, monitoring.
- **Mobile gallery** (`src/components/MobileGalleryView.jsx`, route `/gallery/:sessionId`) — tamu buka di HP sendiri buat lihat/download hasil foto.

Backend: Go (`backend/`), serve API + (saat mode kiosk) serve frontend static dari proses yang sama di `http://localhost:8787`, biar browser kiosk dan Canon EDSDK bridge satu origin.

## 2. Arsitektur komponen

```
Browser kiosk (React/Vite)  --HTTP-->  Go API (backend/cmd/api)  --HTTP-->  Canon EDSDK bridge (photobooth-ui/canon-bridge)
                                            |                                     |
                                            +--> Supabase Storage (opsional)      +--> kamera Canon fisik via EDSDK
                                            +--> JSON file store / Postgres
                                            +--> Midtrans (payment gateway)
```

- **Camera abstraction**: `backend/internal/camera/provider.go` — interface `Provider{List, Capture, LiveViewFrame}`. Satu-satunya implementasi aktif: `EdsdkBridgeProvider` (`edsdk_bridge.go`), bicara ke proses bridge Canon EDSDK terpisah lewat HTTP (`CanonBridgeURL`, default `http://127.0.0.1:8788`). Handler DSLR (`dslr.go`) tidak tahu detail bridge, cuma pakai interface ini.
- **Storage foto**: dua mode — Supabase Storage (kalau `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` diset) atau filesystem lokal di `StorageDir` (served lewat `/files/`).
- **Data store**: `backend/app/store/` — `Store` interface, dengan implementasi JSON-file (`json_store.go`) dan Postgres (`postgres_store.go`). Dipilih via `DATABASE_URL`.
- **Frontend state**: semua di React state lokal (`src/App.jsx`), tidak ada router library — path dicek manual via `window.location.pathname`.

## 3. Entity / data model inti (`backend/app/models/models.go`)

| Entity | Fungsi |
|---|---|
| `Project` | Multi-tenant: satu "project" = satu venue/event, punya `Settings` sendiri (frame, harga, dll). Admin bisa kelola banyak project (`projects.go`). |
| `Session` | Satu sesi foto customer. Field kunci: `ShortCode`, `Status` (lifecycle di bawah), `Images[]`, `FinalImage/PrintImage/AnimatedImage`, `CustomerToken(Hash)` buat otorisasi akses sesi sendiri, `ExpiresAt` (default retensi 7 hari, lihat `config.SessionRetentionDays`). |
| `Gallery` | View publik read-only dari Session (buat halaman `/gallery/:id`), menyembunyikan field sensitif. |
| `Payment` / `PaymentLog` | Transaksi per sesi. Support voucher (`VoucherID`, `DiscountAmount`), multi-provider (`midtrans`, `midtrans-qris`, `qris-simulation`, `free`). `PaymentLog` = audit trail tiap perubahan status. |
| `Voucher` | Kode diskon: `fixed` atau `percent`, punya `MinAmount`, `MaxDiscount`, `UsageLimit/UsedCount`, window `StartsAt/EndsAt`. |
| `Frame` / `FrameGif` / `Filter` | Aset template cetak/animasi/filter kamera, dikelola admin, bisa diaktif/nonaktifkan (`Active`). |
| `AdminUser` / `AdminToken` / `LoginOTP` / `LoginAttempt` | Auth admin: password hash, opsional 2FA (OTP email), token bearer dengan TTL, rate-limit login gagal + lockout. |
| `Message` | Log pengiriman link galeri (email/whatsapp). |
| `AuditLog` | Audit semua aksi penting (admin & customer), dipakai juga buat monitoring error frontend (`monitoring.error.*`). |
| `WalletSettings` / `Withdrawal` / `Subscription` / `PaymentKey` | Fitur bisnis tambahan: rekening pencairan dana, langganan paket, API key payment gateway per project. |

## 4. Flow bisnis end-to-end

### 4.1 Flow kiosk (customer) — state machine di `App.jsx`

```
IDLE → PACKAGE_TIER* → HEADCOUNT* → PAYMENT_1 → CAMERA → STUDIO_EDITOR → [PAYMENT_2 jika upsell] → LIVE_WALL_SHARE → THANK_YOU
```
(*PACKAGE_TIER/HEADCOUNT ada di STEPS tapi current default path dari LandingPage langsung set tier "basic" dan lompat ke PAYMENT_1 — jalur lama via tier-selection masih ada di kode, cek `renderStep()`.)

1. **IDLE** (`LandingPage`) — layar awal/idle, tap mulai.
2. **PAYMENT_1** (`PaymentView`) — bayar sesi awal. Sukses → `POST /api/sessions` (buat Session di backend) lalu `POST /api/payments` → `startTimedSession()` set timer sesi (`sessionTimer` dari kiosk settings, default 5 menit) → masuk **CAMERA**.
3. **CAMERA** (`CameraView`) — ambil foto. Dua mode capture per `cameraProfiles[]`: `webcam` (browser `getUserMedia`) atau `dslr` (lewat `/api/dslr/capture` → EDSDK bridge → file JPEG). Filter wajah via FILTERS/CSS filter di `FilterPanel`.
4. **STUDIO_EDITOR** — pilih frame/layout/paper size, compose hasil akhir (final image, print image, animated/gif). Kalau pilih varian premium → `upsellPrice > 0`.
5. **PAYMENT_2** (opsional, upsell) — bayar tambahan untuk frame/varian premium.
6. **LIVE_WALL_SHARE** (`LiveWallView`) — `POST /api/sessions/:id/finalize` (upload semua gambar final), tampilkan di live wall (layar event), generate link galeri (QR/short link) buat tamu scan.
7. **THANK_YOU** — selesai, auto-reset ke IDLE setelah countdown/idle timeout.

Session timer habis di tengah jalan → `resetApp()` otomatis kembali ke IDLE (customer dianggap walk-away).

### 4.2 Flow mobile gallery (customer, device sendiri)

`GET /api/galleries/:sessionId` → render `MobileGalleryView`. Expired kalau `now > session.ExpiresAt` (410 Gone). Customer bisa minta kirim ulang link (`send-link`, email/whatsapp) dan download foto.

### 4.3 Flow pembayaran

- `POST /api/payments` — hitung diskon voucher dulu (validasi aktif/expired/usage limit/min amount/max discount), lalu pilih gateway:
  - `midtrans` → Snap token + checkout URL.
  - `midtrans-qris` → QR string/image.
  - `qris-simulation` → langsung `paid` (testing/demo).
  - amount ≤ 0 (voucher 100%) → langsung `paid`, provider `free`.
- Konfirmasi status lewat dua jalur: `POST /api/payments/:id/confirm` (dari customer app setelah polling Midtrans) atau `POST /api/payments/:id/webhook` (server-to-server dari Midtrans, diverifikasi `verifyPaymentWebhook`).
- Status `paid`/`success` → `Session.Status = "paid"`.
- Setiap perubahan status dicatat di `PaymentLog` + `AuditLog`.

### 4.4 Flow DSLR capture

`GET /api/dslr/cameras` (list) → `GET /api/dslr/liveview` (preview frame, bisa 501 kalau provider tak dukung) → `POST /api/dslr/capture {port}` → backend minta bridge shutter release → simpan JPEG ke Supabase atau `storage/tether/` lokal → return URL publik. Cleanup otomatis file tether > 24 jam di setiap capture.

### 4.5 Flow admin (`/admin`, `AdminDashboard.jsx`)

Login (`/api/admin/auth/login`) → opsional OTP 2FA via email (`login/verify-otp`) → token bearer (TTL jam, default 12). Role: **`owner`** (full akses, termasuk hapus session, kelola voucher/frame/user admin, storage/cleanup) vs **admin biasa** (akses terbatas, audit log cuma lihat kategori monitoring).

Tab-tab admin (dari daftar komponen): Overview/stats (`AdminOverview`), Frame Manager, Frame GIF Manager, Filter Panel admin, Vouchers, Wallet (saldo & penarikan), Payment Keys (API key gateway per project), Profile, Project Manager (multi-tenant switch), Device Setup Modal (konfigurasi kamera/kiosk), Headcount/Package Tier config.

- **Cleanup**: owner trigger manual (`POST /api/admin/cleanup`) atau otomatis tiap `CleanupIntervalMins` (default 60) — hapus session + file yang `ExpiresAt` lewat.
- **Storage stats**: owner-only, `GET /api/admin/storage`.
- **Audit log**: semua aksi admin & customer penting dicatat (login, create/update/delete session, payment, voucher, frame, dll), termasuk snapshot data yang dihapus (buat rollback manual/investigasi).

### 4.6 Device Setup (`DeviceSetupModal.jsx` + `kioskConfig.js`)

Konfigurasi per-kiosk disimpan di `localStorage` (`potobox_kiosk_settings`) dan disinkronkan ke server (`/api/settings`, per `projectId` kalau multi-project). Isi: identitas booth, URL publik frontend/galeri/backend API, sampai 2 profil kamera (masing-masing: `captureMode` webcam/dslr, `tetherPort`, `facingMode`, `mirror`), idle timeout, timer kamera & sesi.

## 5. Auth & keamanan

- **Customer session**: token per-session (`CustomerToken`/`CustomerTokenHash`), dicek via `requireCustomerSession()` — mencegah orang lain akses/modif session customer lain.
- **Admin**: bearer token (`x-admin-key`/`authorization`), hash di DB, TTL per `AdminTokenTTLHrs`. Rate-limit login (lockout setelah gagal berkali-kali). 2FA opsional per user (`TwoFactorEnabled`).
- **Admin roles**: `owner` > `admin` (owner-only: hapus session, user admin, frame, voucher, storage, cleanup).
- **Security headers** global (`setSecurityHeaders`): CSP, X-Frame-Options DENY, nosniff, dll.
- **CORS**: origin whitelist dari `ALLOWED_ORIGINS`, default localhost-only.
- **Rate limiting** per endpoint sensitif (login, payment create, send-link, webhook, error-events).
- **Audit log** menyeluruh dengan before/after snapshot untuk operasi destructive.

## 6. Yang SUDAH DIHAPUS (jangan dibangun ulang tanpa diminta)

Dari git status: `hardware_agent.go`, `printer.go`, folder `cmd/camera-agent/` (gphoto-based), `internal/camera/gphoto_agent.go`, `gphoto_local.go`, `mock.go`, installer NSIS camera-agent, script admin ad-hoc di root (`check_admin.go`, `create_admin.go`, dll). Flow printer fisik dan agent gphoto lama **tidak aktif** — kamera sekarang hanya lewat `EdsdkBridgeProvider` (Canon EDSDK bridge).

## 7. Batasan untuk kerja modernisasi UI/UX berikutnya

Saat redesign tampilan (poin 5 — modernisasi UI/UX), **JANGAN ubah**:
- Urutan state `STEPS` di `App.jsx` dan kontrak props antar step (`onNext`, `onBack`, `onPaymentSuccess`, `onFinishSession`, dll).
- Endpoint/payload API (`src/utils/backendApi.js`, `src/utils/dslr.js`) — kontrak request/response backend.
- Logic voucher/diskon, status lifecycle Session/Payment, role owner/admin.
- `kioskConfig.js` schema (dipakai sinkron ke backend `/api/settings`).

Yang BOLEH disentuh bebas: styling, layout, komponen UI (`src/components/ui/`), animasi transisi antar step, struktur visual AdminDashboard — selama data/props yang dikonsumsi tetap sama.

## 8. File peta cepat

| Area | File |
|---|---|
| Routing API | `backend/app/httpapi/server.go` (`Routes()`) |
| DSLR | `backend/app/httpapi/dslr.go`, `backend/internal/camera/*.go` |
| Auth admin | `backend/app/httpapi/server.go` (`requireAdmin`, `requireOwner`), `backend/app/auth/password.go` |
| Project multi-tenant | `backend/app/httpapi/projects.go` |
| Settings kiosk | `backend/app/httpapi/settings.go`, `src/utils/kioskConfig.js` |
| Data model | `backend/app/models/models.go` |
| Store | `backend/app/store/{json_store,postgres_store,store}.go` |
| Kiosk flow | `src/App.jsx` |
| Admin UI | `src/components/AdminDashboard.jsx` + tab components |
| Device config UI | `src/components/DeviceSetupModal.jsx` |
| Live wall/share | `src/components/LiveWallView.jsx` |
