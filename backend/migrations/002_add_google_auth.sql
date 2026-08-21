-- Add Google OAuth fields
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Make password_hash nullable for OAuth-only users
ALTER TABLE admin_users ALTER COLUMN password_hash DROP NOT NULL;
