# Cloudflare API migration

`cloudflare-api/` is a separate Worker API. It is deliberately separate from the frontend Worker until D1 and R2 are provisioned, so the active frontend deployment is not disrupted.

## Provision resources

```bash
npx wrangler d1 create urbanmenphoto
npx wrangler r2 bucket create urbanmenphoto-media
cp cloudflare-api/wrangler.jsonc.example cloudflare-api/wrangler.jsonc
```

Replace `REPLACE_WITH_D1_DATABASE_ID`, set `PUBLIC_BASE_URL` to the future API Worker URL, and add the frontend Worker URL to `ALLOWED_ORIGINS`. Then apply the schema and deploy:

```bash
npx wrangler d1 execute urbanmenphoto --file=cloudflare-api/migrations/0001_initial.sql --remote
npx wrangler deploy --config cloudflare-api/wrangler.jsonc
```

## Current endpoint coverage

The first Worker migration covers health, sessions, finalization to R2, gallery reads, R2 file reads, frames, and client error events. The remaining admin, Midtrans payment, messaging, voucher, and audit endpoints must be migrated before removing the Go backend.

## DSLR

DSLR tethering stays in the local kiosk agent. A Cloudflare Worker cannot access a USB camera or execute `gphoto2`.
