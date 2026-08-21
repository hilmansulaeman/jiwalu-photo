# CI/CD

Repository ini memakai GitHub Actions untuk validasi dan deploy ke Vercel.

## Workflow

- `CI`: jalan saat `pull_request` dan push ke `dev`, `staging`, atau `main`.
- `Deploy`: jalan saat push ke `dev`, `staging`, atau `main`, dan bisa dijalankan manual dari tab Actions.

## Branch Mapping

- `dev`: deploy frontend ke Cloudflare Workers project `urbanmenphoto` melalui integrasi Git Cloudflare.
- `staging` atau `main`: deploy backend ke `urbanmenphoto-backend-staging`, lalu deploy frontend ke `photo-box-staging`.

## GitHub Secrets

Isi secrets ini di GitHub repository settings:

| Secret | Value |
| --- | --- |
| `VERCEL_FRONTEND_STAGING_PROJECT_ID` | `prj_7d3gZ1ub9HwavH8jRW7IJJQvoQIS` |
| `VERCEL_BACKEND_STAGING_PROJECT_ID` | `prj_uS01x6FawdpZj6hAEfQhlIIDjihD` |

## Catatan Env

Cloudflare Worker dev dikelola dari dashboard melalui integrasi Git; tidak membutuhkan Cloudflare API token di GitHub secrets. Pada setup pertama, gunakan build command `npm run build`, deploy command `npx wrangler deploy`, dan pilih branch produksi `dev`.

Env rahasia seperti `DATABASE_URL`, SMTP, Midtrans server key, dan Midtrans client key tetap diatur di Vercel project backend. Workflow hanya memilih project dan menjalankan deploy.
