# Deployment — single-kiosk PC (Windows)

Camera hardware access only works on the machine physically tethered to the
camera, so `backend` and `canon-bridge` must run **on the kiosk PC itself** —
never on a remote/serverless host.

## Processes (all loopback, one PC)

| Process | Port | Purpose |
|---|---|---|
| `CanonBridge.exe` | `127.0.0.1:8788` | Talks to Canon EDSDK.dll, never exposed beyond loopback |
| Backend (`urbanmenphoto-backend.exe`) | `127.0.0.1:8787` | API + serves the built frontend (`FRONTEND_DIST_DIR`, default `../dist`) |
| Browser (kiosk mode) or Tauri app | — | Opens `http://localhost:8787` |

Tauri (`src-tauri`) is optional — it only wraps the window (fullscreen, no
browser chrome). The backend already serves the built frontend directly, so
a plain kiosk-mode browser window works without it.

## 1. Build canon-bridge

```bash
cd photobooth-ui/canon-bridge
dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -o dist
```

Copy to the kiosk PC: `dist/CanonBridge.exe` + `vendor/edsdk/EDSDK.dll` (native
DLL, must sit next to the exe — cannot be embedded) + `appsettings.json`.

## 2. Build backend

```bash
cd backend
go build -o urbanmenphoto-backend.exe ./cmd/api
```

`backend/.env` on the kiosk PC:

```bash
CANON_BRIDGE_URL=http://127.0.0.1:8788
BACKEND_PORT=8787
PUBLIC_BASE_URL=<public domain or tunnel for this kiosk>
MIDTRANS_ENVIRONMENT=production
MIDTRANS_SERVER_KEY=...
MIDTRANS_CLIENT_KEY=...
PAYMENT_WEBHOOK_SECRET=...
DATABASE_URL=   # empty = local JSON store; set to share one Postgres across multiple kiosks
```

Create the first admin:

```bash
npm run backend:admin -- -email admin@urbanmenphoto.com -role owner
```

## 3. Build frontend

```bash
npm run build -- --mode kiosk
```

Output `dist/` is served automatically by the backend from step 2.

## 4. (Optional) Desktop app instead of browser

```bash
npm run desktop:build
```

Bundles `src-tauri` into an installer.

## 5. Auto-start on boot

Add shortcuts for `CanonBridge.exe` and `urbanmenphoto-backend.exe` to the
Windows Startup folder (`shell:startup`).

## 6. Payment webhook

Midtrans calls back to `PUBLIC_BASE_URL`. The kiosk PC is normally behind a
store/mall NAT, so this needs either a port-forwarded public domain or a
persistent tunnel (e.g. Cloudflare Tunnel) per kiosk — set up before go-live,
not after.

## Verify before go-live

1. `CanonBridge.exe` running, camera tethered → `curl http://127.0.0.1:8788/api/cameras` returns the camera.
2. Backend running → `/api/dslr/cameras` proxies through to the Canon EDSDK bridge.
3. Full flow: open session → capture → finalize → payment → webhook received.
4. Admin login works (`POST /api/admin/auth/login`).
