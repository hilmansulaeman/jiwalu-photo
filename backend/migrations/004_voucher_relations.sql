ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS voucher_id TEXT REFERENCES vouchers(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS original_amount BIGINT NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount_amount BIGINT NOT NULL DEFAULT 0;

-- Set original_amount to amount for existing records if original_amount is 0
UPDATE payments SET original_amount = amount WHERE original_amount = 0;
