CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  short_code TEXT NOT NULL UNIQUE,
  email TEXT,
  phone TEXT,
  layout_id TEXT,
  paper_size TEXT,
  frame_id TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  final_image_key TEXT,
  print_image_key TEXT,
  animated_image_key TEXT,
  download_url TEXT NOT NULL,
  customer_token_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS session_images (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'IDR',
  status TEXT NOT NULL DEFAULT 'pending',
  provider_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS frames (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom',
  layout_count INTEGER NOT NULL DEFAULT 0,
  image_url TEXT NOT NULL,
  slot_json TEXT,
  template_type TEXT NOT NULL DEFAULT 'strip',
  paper_size TEXT NOT NULL DEFAULT 'strip-2x6',
  orientation TEXT NOT NULL DEFAULT 'portrait',
  print_mode TEXT NOT NULL DEFAULT 'auto',
  print_copies INTEGER NOT NULL DEFAULT 2,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS error_events (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  session_id TEXT,
  message TEXT NOT NULL,
  source TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_session_images_session ON session_images(session_id, position);
CREATE INDEX IF NOT EXISTS idx_payments_session ON payments(session_id, created_at DESC);
