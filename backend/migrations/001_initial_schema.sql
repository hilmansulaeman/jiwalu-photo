CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  short_code TEXT UNIQUE NOT NULL,
  email TEXT,
  phone TEXT,
  layout_id TEXT,
  paper_size TEXT,
  frame_id TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  final_image_key TEXT,
  final_image_url TEXT,
  print_image_key TEXT,
  print_image_url TEXT,
  animated_image_key TEXT,
  animated_image_url TEXT,
  download_url TEXT NOT NULL,
  customer_token_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS print_image_key TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS print_image_url TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS animated_image_key TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS animated_image_url TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS customer_token_hash TEXT;

CREATE TABLE IF NOT EXISTS session_images (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  public_url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  recipient TEXT,
  download_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  provider_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  amount BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'IDR',
  status TEXT NOT NULL DEFAULT 'pending',
  provider_reference TEXT,
  snap_token TEXT,
  checkout_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_reference TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS snap_token TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS checkout_url TEXT;

CREATE TABLE IF NOT EXISTS payment_logs (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event TEXT NOT NULL,
  provider TEXT NOT NULL,
  amount BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'IDR',
  status_before TEXT,
  status_after TEXT NOT NULL,
  provider_reference TEXT,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS frames (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom',
  layout_count INT NOT NULL DEFAULT 0,
  image_url TEXT NOT NULL,
  slot_json JSONB,
  template_type TEXT NOT NULL DEFAULT 'strip',
  paper_size TEXT NOT NULL DEFAULT 'strip-2x6',
  orientation TEXT NOT NULL DEFAULT 'portrait',
  print_mode TEXT NOT NULL DEFAULT 'auto',
  print_copies INT NOT NULL DEFAULT 2,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE frames ADD COLUMN IF NOT EXISTS template_type TEXT NOT NULL DEFAULT 'strip';
ALTER TABLE frames ADD COLUMN IF NOT EXISTS paper_size TEXT NOT NULL DEFAULT 'strip-2x6';
ALTER TABLE frames ADD COLUMN IF NOT EXISTS orientation TEXT NOT NULL DEFAULT 'portrait';
ALTER TABLE frames ADD COLUMN IF NOT EXISTS print_mode TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE frames ADD COLUMN IF NOT EXISTS print_copies INT NOT NULL DEFAULT 2;

CREATE TABLE IF NOT EXISTS vouchers (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'fixed',
  value BIGINT NOT NULL DEFAULT 0,
  min_amount BIGINT NOT NULL DEFAULT 0,
  max_discount BIGINT NOT NULL DEFAULT 0,
  usage_limit INT NOT NULL DEFAULT 0,
  used_count INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT PRIMARY KEY,
  failed_count INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_session_images_session_id ON session_images(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_payments_session_id ON payments(session_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_payment_id ON payment_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_session_id ON payment_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_created_at ON payment_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);
CREATE INDEX IF NOT EXISTS idx_vouchers_active ON vouchers(active);
CREATE INDEX IF NOT EXISTS idx_admin_tokens_user_id ON admin_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_tokens_expires_at ON admin_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);

CREATE TABLE IF NOT EXISTS filters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'CUSTOM',
  css TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cover_image TEXT,
  settings JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
