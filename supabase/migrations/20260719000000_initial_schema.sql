-- Supabase uses PostgreSQL, so this schema is deliberately compatible with
-- the current Go/PostgreSQL backend and can be applied from the SQL Editor.
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, short_code TEXT UNIQUE NOT NULL, email TEXT, phone TEXT,
  layout_id TEXT, paper_size TEXT, frame_id TEXT, status TEXT NOT NULL DEFAULT 'created',
  final_image_key TEXT, print_image_key TEXT, animated_image_key TEXT,
  download_url TEXT NOT NULL, customer_token_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS session_images (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, storage_key TEXT NOT NULL, mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS frames (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'custom',
  layout_count INTEGER NOT NULL DEFAULT 0, image_url TEXT NOT NULL, slot_json JSONB,
  template_type TEXT NOT NULL DEFAULT 'strip', paper_size TEXT NOT NULL DEFAULT 'strip-2x6',
  orientation TEXT NOT NULL DEFAULT 'portrait', print_mode TEXT NOT NULL DEFAULT 'auto',
  print_copies INTEGER NOT NULL DEFAULT 2, active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, amount BIGINT NOT NULL, currency TEXT NOT NULL DEFAULT 'IDR',
  status TEXT NOT NULL DEFAULT 'pending', provider_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS error_events (
  id TEXT PRIMARY KEY, category TEXT NOT NULL, session_id TEXT, message TEXT NOT NULL,
  source TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO storage.buckets (id, name, public) VALUES ('photos', 'photos', false) ON CONFLICT (id) DO NOTHING;
