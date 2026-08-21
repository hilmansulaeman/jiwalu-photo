# Supabase backend migration

Cloudflare hosts the React frontend. Supabase provides PostgreSQL, the private `photos` Storage bucket, and the `api` Edge Function. The DSLR agent remains local.

1. Create a Supabase project, then run `supabase link --project-ref <project-ref>`.
2. Apply `supabase/migrations/20260719000000_initial_schema.sql` from the Supabase SQL Editor or with `supabase db push`.
3. Set Edge Function secrets: `ALLOWED_ORIGIN`, `PUBLIC_FRONTEND_URL`, and any payment/provider secrets.
4. Deploy with `supabase functions deploy api --no-verify-jwt`.

Do not expose `SUPABASE_SERVICE_ROLE_KEY` in the React application or Cloudflare Worker. It is only available to the Edge Function.

The first Edge Function includes health, frames, and session creation. Admin, payment, gallery/finalize, Storage upload, and messaging endpoints are migrated next before switching `VITE_BACKEND_API_URL`.
