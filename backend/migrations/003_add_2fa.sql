-- Add Two-Factor Authentication support

-- 1. Add two_factor_enabled column to admin_users
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false;

-- 2. Create login_otps table to store temporary OTPs
CREATE TABLE IF NOT EXISTS login_otps (
  email TEXT PRIMARY KEY,
  otp TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for expiring OTPs
CREATE INDEX IF NOT EXISTS idx_login_otps_expires_at ON login_otps(expires_at);
