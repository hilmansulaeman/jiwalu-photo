package store

import (
	"database/sql"
	_ "embed"
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"urbanmenphoto/backend/app/models"
)

//go:embed migrations/001_initial_schema.sql
var embeddedInitialSchema string

type PostgresStore struct {
	db *sql.DB
}

func NewPostgresStore(databaseURL string) (*PostgresStore, error) {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}

	store := &PostgresStore{db: db}
	if err := store.applyMigrations(); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *PostgresStore) applyMigrations() error {
	migrationPath := resolveMigrationPath()
	query, err := os.ReadFile(migrationPath)
	if err != nil {
		query = []byte(embeddedInitialSchema)
	}
	_, err = s.db.Exec(string(query))
	return err
}

func resolveMigrationPath() string {
	paths := []string{
		filepath.Join("backend", "migrations", "001_initial_schema.sql"),
		filepath.Join("migrations", "001_initial_schema.sql"),
		filepath.Join("..", "..", "migrations", "001_initial_schema.sql"),
	}
	for _, path := range paths {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}
	return paths[0]
}

func (s *PostgresStore) ListSessions() []models.Session {
	rows, err := s.db.Query(`
		SELECT id, short_code, email, phone, layout_id, paper_size, frame_id, status,
		       final_image_key, final_image_url, print_image_key, print_image_url,
		       animated_image_key, animated_image_url,
		       download_url, customer_token_hash, created_at, updated_at, expires_at
		FROM sessions
		ORDER BY created_at DESC
		LIMIT 500
	`)
	if err != nil {
		return []models.Session{}
	}
	defer rows.Close()

	sessions := []models.Session{}
	for rows.Next() {
		if session, err := scanSession(rows); err == nil {
			s.hydrateSessionImages(&session)
			sessions = append(sessions, session)
		}
	}
	return sessions
}

func (s *PostgresStore) FindSession(id string) (models.Session, bool) {
	row := s.db.QueryRow(`
		SELECT id, short_code, email, phone, layout_id, paper_size, frame_id, status,
		       final_image_key, final_image_url, print_image_key, print_image_url,
		       animated_image_key, animated_image_url,
		       download_url, customer_token_hash, created_at, updated_at, expires_at
		FROM sessions
		WHERE id = $1 OR short_code = $1
	`, id)
	session, err := scanSession(row)
	if err != nil {
		return models.Session{}, false
	}
	s.hydrateSessionImages(&session)
	return session, true
}

func (s *PostgresStore) InsertSession(session models.Session) error {
	_, err := s.db.Exec(`
		INSERT INTO sessions (
			id, short_code, email, phone, layout_id, paper_size, frame_id, status,
			final_image_key, final_image_url, print_image_key, print_image_url,
			animated_image_key, animated_image_url,
			download_url, customer_token_hash, created_at, updated_at, expires_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
	`, session.ID, session.ShortCode, session.Email, session.Phone, session.LayoutID, session.PaperSize, session.FrameID,
		session.Status, imageKey(session.FinalImage), imageURL(session.FinalImage), imageKey(session.PrintImage), imageURL(session.PrintImage),
		imageKey(session.AnimatedImage), imageURL(session.AnimatedImage), session.DownloadURL,
		session.CustomerTokenHash, session.CreatedAt, session.UpdatedAt, session.ExpiresAt)
	return err
}

func (s *PostgresStore) UpdateSession(session models.Session) error {
	_, err := s.db.Exec(`
		UPDATE sessions
		SET email=$2, phone=$3, layout_id=$4, paper_size=$5, frame_id=$6, status=$7,
		    final_image_key=$8, final_image_url=$9, print_image_key=$10, print_image_url=$11,
		    animated_image_key=$12, animated_image_url=$13,
		    download_url=$14, customer_token_hash=$15, updated_at=$16, expires_at=$17
		WHERE id=$1
	`, session.ID, session.Email, session.Phone, session.LayoutID, session.PaperSize, session.FrameID,
		session.Status, imageKey(session.FinalImage), imageURL(session.FinalImage), imageKey(session.PrintImage), imageURL(session.PrintImage),
		imageKey(session.AnimatedImage), imageURL(session.AnimatedImage), session.DownloadURL,
		session.CustomerTokenHash, session.UpdatedAt, session.ExpiresAt)
	if err != nil {
		return err
	}
	return s.replaceSessionImages(session.ID, session.Images)
}

func (s *PostgresStore) DeleteSession(id string) (models.Session, error) {
	session, ok := s.FindSession(id)
	if !ok {
		return models.Session{}, os.ErrNotExist
	}
	_, err := s.db.Exec(`DELETE FROM sessions WHERE id = $1`, session.ID)
	return session, err
}

func (s *PostgresStore) InsertMessage(message models.Message) error {
	_, err := s.db.Exec(`
		INSERT INTO messages (id, session_id, channel, recipient, download_url, status, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
	`, message.ID, message.SessionID, message.Channel, message.Recipient, message.DownloadURL, message.Status, message.CreatedAt)
	return err
}

func (s *PostgresStore) ListMessages() []models.Message {
	rows, err := s.db.Query(`
		SELECT id, session_id, channel, recipient, download_url, status, created_at
		FROM messages
		ORDER BY created_at DESC
		LIMIT 500
	`)
	if err != nil {
		return []models.Message{}
	}
	defer rows.Close()
	return scanMessages(rows)
}

func (s *PostgresStore) MessagesBySession(sessionID string) []models.Message {
	rows, err := s.db.Query(`
		SELECT id, session_id, channel, recipient, download_url, status, created_at
		FROM messages
		WHERE session_id = $1
		ORDER BY created_at DESC
	`, sessionID)
	if err != nil {
		return []models.Message{}
	}
	defer rows.Close()
	return scanMessages(rows)
}

func (s *PostgresStore) ListPayments() []models.Payment {
	rows, err := s.db.Query(`
		SELECT id, session_id, provider, amount, currency, status,
		       provider_reference, snap_token, checkout_url, voucher_id, original_amount, discount_amount, created_at, updated_at
		FROM payments
		ORDER BY created_at DESC
		LIMIT 500
	`)
	if err != nil {
		return []models.Payment{}
	}
	defer rows.Close()
	return scanPayments(rows)
}

func (s *PostgresStore) FindPayment(id string) (models.Payment, bool) {
	row := s.db.QueryRow(`
		SELECT id, session_id, provider, amount, currency, status,
		       provider_reference, snap_token, checkout_url, voucher_id, original_amount, discount_amount, created_at, updated_at
		FROM payments
		WHERE id = $1
	`, id)
	payment, err := scanPayment(row)
	return payment, err == nil
}

func (s *PostgresStore) PaymentsBySession(sessionID string) []models.Payment {
	rows, err := s.db.Query(`
		SELECT id, session_id, provider, amount, currency, status,
		       provider_reference, snap_token, checkout_url, voucher_id, original_amount, discount_amount, created_at, updated_at
		FROM payments
		WHERE session_id = $1
		ORDER BY created_at DESC
	`, sessionID)
	if err != nil {
		return []models.Payment{}
	}
	defer rows.Close()
	return scanPayments(rows)
}

func (s *PostgresStore) InsertPayment(payment models.Payment) error {
	_, err := s.db.Exec(`
		INSERT INTO payments (
			id, session_id, provider, amount, currency, status,
			provider_reference, snap_token, checkout_url, voucher_id, original_amount, discount_amount, created_at, updated_at
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
	`, payment.ID, payment.SessionID, payment.Provider, payment.Amount, payment.Currency, payment.Status,
		payment.ProviderRef, payment.SnapToken, payment.CheckoutURL, payment.VoucherID, payment.OriginalAmount, payment.DiscountAmount, payment.CreatedAt, payment.UpdatedAt)
	return err
}

func (s *PostgresStore) UpdatePayment(payment models.Payment) error {
	_, err := s.db.Exec(`
		UPDATE payments
		SET provider=$2, amount=$3, currency=$4, status=$5,
		    provider_reference=$6, snap_token=$7, checkout_url=$8, voucher_id=$9, original_amount=$10, discount_amount=$11, updated_at=$12
		WHERE id=$1
	`, payment.ID, payment.Provider, payment.Amount, payment.Currency, payment.Status,
		payment.ProviderRef, payment.SnapToken, payment.CheckoutURL, payment.VoucherID, payment.OriginalAmount, payment.DiscountAmount, payment.UpdatedAt)
	return err
}

func (s *PostgresStore) InsertPaymentLog(log models.PaymentLog) error {
	_, err := s.db.Exec(`
		INSERT INTO payment_logs (
			id, payment_id, session_id, event, provider, amount, currency,
			status_before, status_after, provider_reference, request_payload,
			ip, user_agent, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14)
	`, log.ID, log.PaymentID, log.SessionID, log.Event, log.Provider, log.Amount, log.Currency,
		log.StatusBefore, log.StatusAfter, log.ProviderRef, log.RequestPayload, log.IP, log.UserAgent, log.CreatedAt)
	return err
}

func (s *PostgresStore) ListPaymentLogs() []models.PaymentLog {
	rows, err := s.db.Query(`
		SELECT id, payment_id, session_id, event, provider, amount, currency,
		       status_before, status_after, provider_reference, COALESCE(request_payload::text, '{}'),
		       ip, user_agent, created_at
		FROM payment_logs
		ORDER BY created_at DESC
		LIMIT 1000
	`)
	if err != nil {
		return []models.PaymentLog{}
	}
	defer rows.Close()
	return scanPaymentLogs(rows)
}

func (s *PostgresStore) PaymentLogsByPayment(paymentID string) []models.PaymentLog {
	rows, err := s.db.Query(`
		SELECT id, payment_id, session_id, event, provider, amount, currency,
		       status_before, status_after, provider_reference, COALESCE(request_payload::text, '{}'),
		       ip, user_agent, created_at
		FROM payment_logs
		WHERE payment_id = $1
		ORDER BY created_at DESC
	`, paymentID)
	if err != nil {
		return []models.PaymentLog{}
	}
	defer rows.Close()
	return scanPaymentLogs(rows)
}

func (s *PostgresStore) ListFrames() []models.Frame {
	rows, err := s.db.Query(`
		SELECT id, name, category, layout_count, image_url, COALESCE(slot_json::text, ''),
		       COALESCE(template_type, 'strip'), COALESCE(paper_size, 'strip-2x6'),
		       COALESCE(orientation, 'portrait'), COALESCE(print_mode, 'auto'),
		       COALESCE(print_copies, 2), active, created_at, updated_at
		FROM frames
		ORDER BY created_at DESC
	`)
	if err != nil {
		return []models.Frame{}
	}
	defer rows.Close()

	frames := []models.Frame{}
	for rows.Next() {
		var frame models.Frame
		if err := rows.Scan(
			&frame.ID, &frame.Name, &frame.Category, &frame.LayoutCount, &frame.ImageURL, &frame.SlotJSON,
			&frame.TemplateType, &frame.PaperSize, &frame.Orientation, &frame.PrintMode, &frame.PrintCopies,
			&frame.Active, &frame.CreatedAt, &frame.UpdatedAt,
		); err == nil {
			frames = append(frames, frame)
		}
	}
	return frames
}

func (s *PostgresStore) UpsertFrame(frame models.Frame) error {
	slotJSON := sql.NullString{String: frame.SlotJSON, Valid: frame.SlotJSON != ""}
	_, err := s.db.Exec(`
		INSERT INTO frames (
			id, name, category, layout_count, image_url, slot_json,
			template_type, paper_size, orientation, print_mode, print_copies,
			active, created_at, updated_at
		)
		VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14)
		ON CONFLICT (id) DO UPDATE SET
			name=EXCLUDED.name,
			category=EXCLUDED.category,
			layout_count=EXCLUDED.layout_count,
			image_url=EXCLUDED.image_url,
			slot_json=EXCLUDED.slot_json,
			template_type=EXCLUDED.template_type,
			paper_size=EXCLUDED.paper_size,
			orientation=EXCLUDED.orientation,
			print_mode=EXCLUDED.print_mode,
			print_copies=EXCLUDED.print_copies,
			active=EXCLUDED.active,
			updated_at=EXCLUDED.updated_at
	`, frame.ID, frame.Name, frame.Category, frame.LayoutCount, frame.ImageURL, slotJSON,
		frame.TemplateType, frame.PaperSize, frame.Orientation, frame.PrintMode, frame.PrintCopies,
		frame.Active, frame.CreatedAt, frame.UpdatedAt)
	return err
}

func (s *PostgresStore) DeleteFrame(id string) error {
	_, err := s.db.Exec(`DELETE FROM frames WHERE id = $1`, id)
	return err
}

func (s *PostgresStore) ListVouchers() []models.Voucher {
	rows, err := s.db.Query(`
		SELECT id, code, name, type, value, min_amount, max_discount, usage_limit, used_count, active, created_by, starts_at, ends_at, created_at, updated_at
		FROM vouchers
		ORDER BY created_at DESC
	`)
	if err != nil {
		return []models.Voucher{}
	}
	defer rows.Close()

	vouchers := []models.Voucher{}
	for rows.Next() {
		var voucher models.Voucher
		var startsAt, endsAt sql.NullTime
		var createdBy sql.NullString
		if err := rows.Scan(
			&voucher.ID, &voucher.Code, &voucher.Name, &voucher.Type, &voucher.Value, &voucher.MinAmount,
			&voucher.MaxDiscount, &voucher.UsageLimit, &voucher.UsedCount, &voucher.Active, &createdBy, &startsAt, &endsAt, &voucher.CreatedAt, &voucher.UpdatedAt,
		); err == nil {
			if startsAt.Valid {
				voucher.StartsAt = &startsAt.Time
			}
			if endsAt.Valid {
				voucher.EndsAt = &endsAt.Time
			}
			if createdBy.Valid {
				voucher.CreatedBy = &createdBy.String
			}
			vouchers = append(vouchers, voucher)
		}
	}
	return vouchers
}

func (s *PostgresStore) UpsertVoucher(voucher models.Voucher) error {
	_, err := s.db.Exec(`
		INSERT INTO vouchers (
			id, code, name, type, value, min_amount, max_discount,
			usage_limit, used_count, active, created_by, starts_at, ends_at, created_at, updated_at
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		ON CONFLICT (id) DO UPDATE SET
			code=EXCLUDED.code,
			name=EXCLUDED.name,
			type=EXCLUDED.type,
			value=EXCLUDED.value,
			min_amount=EXCLUDED.min_amount,
			max_discount=EXCLUDED.max_discount,
			usage_limit=EXCLUDED.usage_limit,
			used_count=EXCLUDED.used_count,
			active=EXCLUDED.active,
			created_by=EXCLUDED.created_by,
			starts_at=EXCLUDED.starts_at,
			ends_at=EXCLUDED.ends_at,
			updated_at=EXCLUDED.updated_at
	`, voucher.ID, voucher.Code, voucher.Name, voucher.Type, voucher.Value, voucher.MinAmount,
		voucher.MaxDiscount, voucher.UsageLimit, voucher.UsedCount, voucher.Active, voucher.CreatedBy,
		voucher.StartsAt, voucher.EndsAt, voucher.CreatedAt, voucher.UpdatedAt)
	return err
}

func (s *PostgresStore) DeleteFilter(id string) error {
	result, err := s.db.Exec(`DELETE FROM filters WHERE id = $1`, id)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return os.ErrNotExist
	}
	return nil
}

func (s *PostgresStore) DeleteVoucher(id string) error {
	result, err := s.db.Exec(`DELETE FROM vouchers WHERE id = $1`, id)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return os.ErrNotExist
	}
	return nil
}

func (s *PostgresStore) FindAdminUserByEmail(email string) (models.AdminUser, bool) {
	row := s.db.QueryRow(`
		SELECT id, email, password_hash, role, created_at, updated_at
		FROM admin_users
		WHERE email = $1
	`, email)
	user, err := scanAdminUser(row)
	return user, err == nil
}

func (s *PostgresStore) FindAdminUserByID(id string) (models.AdminUser, bool) {
	row := s.db.QueryRow(`
		SELECT id, email, password_hash, role, created_at, updated_at
		FROM admin_users
		WHERE id = $1
	`, id)
	user, err := scanAdminUser(row)
	return user, err == nil
}

func (s *PostgresStore) ListAdminUsers() []models.AdminUser {
	rows, err := s.db.Query(`
		SELECT id, email, password_hash, role, created_at, updated_at
		FROM admin_users
		ORDER BY created_at ASC
	`)
	if err != nil {
		return []models.AdminUser{}
	}
	defer rows.Close()

	users := []models.AdminUser{}
	for rows.Next() {
		if user, err := scanAdminUser(rows); err == nil {
			users = append(users, user)
		}
	}
	return users
}

func (s *PostgresStore) UpsertAdminUser(user models.AdminUser) error {
	_, err := s.db.Exec(`
		INSERT INTO admin_users (id, email, password_hash, role, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (email) DO UPDATE SET
			password_hash=EXCLUDED.password_hash,
			role=EXCLUDED.role,
			updated_at=EXCLUDED.updated_at
	`, user.ID, user.Email, user.PasswordHash, user.Role, user.CreatedAt, user.UpdatedAt)
	return err
}

func (s *PostgresStore) DeleteAdminUser(id string) error {
	result, err := s.db.Exec(`DELETE FROM admin_users WHERE id = $1`, id)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return os.ErrNotExist
	}
	return nil
}

func (s *PostgresStore) InsertAdminToken(token models.AdminToken) error {
	_, err := s.db.Exec(`
		DELETE FROM admin_tokens WHERE user_id = $1 OR expires_at <= $2
	`, token.UserID, token.CreatedAt)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`
		INSERT INTO admin_tokens (token, user_id, expires_at, created_at)
		VALUES ($1,$2,$3,$4)
	`, token.TokenHash, token.UserID, token.ExpiresAt, token.CreatedAt)
	return err
}

func (s *PostgresStore) FindAdminTokenByHash(tokenHash string) (models.AdminToken, bool) {
	row := s.db.QueryRow(`
		SELECT token, user_id, expires_at, created_at
		FROM admin_tokens
		WHERE token = $1
	`, tokenHash)
	var token models.AdminToken
	err := row.Scan(&token.TokenHash, &token.UserID, &token.ExpiresAt, &token.CreatedAt)
	return token, err == nil
}

func (s *PostgresStore) UpdateAdminToken(token models.AdminToken) error {
	_, err := s.db.Exec(`
		UPDATE admin_tokens
		SET last_used_at = $2
		WHERE token = $1
	`, token.TokenHash, token.LastUsedAt)
	return err
}

func (s *PostgresStore) DeleteAdminToken(tokenHash string) error {
	result, err := s.db.Exec(`DELETE FROM admin_tokens WHERE token = $1`, tokenHash)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return os.ErrNotExist
	}
	return nil
}

func (s *PostgresStore) InsertAuditLog(log models.AuditLog) error {
	if log.Metadata == nil {
		log.Metadata = map[string]any{}
	}
	metadata, err := json.Marshal(log.Metadata)
	if err != nil {
		metadata = []byte(`{}`)
	}
	_, err = s.db.Exec(`
		INSERT INTO audit_logs (id, actor_id, action, resource, metadata, ip, user_agent, success, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
	`, log.ID, log.ActorID, log.Action, log.Resource, string(metadata), log.IP, log.UserAgent, log.Success, log.CreatedAt)
	return err
}

func (s *PostgresStore) ListAuditLogs() []models.AuditLog {
	rows, err := s.db.Query(`
		SELECT id, actor_id, action, resource, metadata, ip, user_agent, success, created_at
		FROM audit_logs
		ORDER BY created_at DESC
		LIMIT 500
	`)
	if err != nil {
		return []models.AuditLog{}
	}
	defer rows.Close()

	logs := []models.AuditLog{}
	for rows.Next() {
		var log models.AuditLog
		var metadata []byte
		if err := rows.Scan(&log.ID, &log.ActorID, &log.Action, &log.Resource, &metadata, &log.IP, &log.UserAgent, &log.Success, &log.CreatedAt); err == nil {
			if len(metadata) > 0 {
				_ = json.Unmarshal(metadata, &log.Metadata)
			}
			logs = append(logs, log)
		}
	}
	return logs
}

func (s *PostgresStore) FindLoginAttempt(email string) (models.LoginAttempt, bool) {
	row := s.db.QueryRow(`
		SELECT email, failed_count, locked_until, last_attempt_at
		FROM login_attempts
		WHERE email = $1
	`, email)
	var attempt models.LoginAttempt
	err := row.Scan(&attempt.Email, &attempt.FailedCount, &attempt.LockedUntil, &attempt.LastAttemptAt)
	return attempt, err == nil
}

func (s *PostgresStore) UpsertLoginAttempt(attempt models.LoginAttempt) error {
	_, err := s.db.Exec(`
		INSERT INTO login_attempts (email, failed_count, locked_until, last_attempt_at)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (email) DO UPDATE SET
			failed_count=EXCLUDED.failed_count,
			locked_until=EXCLUDED.locked_until,
			last_attempt_at=EXCLUDED.last_attempt_at
	`, attempt.Email, attempt.FailedCount, attempt.LockedUntil, attempt.LastAttemptAt)
	return err
}

func (s *PostgresStore) hydrateSessionImages(session *models.Session) {
	rows, err := s.db.Query(`
		SELECT public_url
		FROM session_images
		WHERE session_id = $1
		ORDER BY position ASC
	`, session.ID)
	if err != nil {
		return
	}
	defer rows.Close()

	images := []string{}
	for rows.Next() {
		var image string
		if err := rows.Scan(&image); err == nil {
			images = append(images, image)
		}
	}
	session.Images = images
}

func (s *PostgresStore) replaceSessionImages(sessionID string, images []string) error {
	if _, err := s.db.Exec(`DELETE FROM session_images WHERE session_id = $1`, sessionID); err != nil {
		return err
	}
	for index, image := range images {
		_, err := s.db.Exec(`
			INSERT INTO session_images (id, session_id, kind, storage_key, public_url, mime_type, size_bytes, position, created_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		`, sessionID+"-image-"+itoa(index+1), sessionID, "gallery", image, image, "image/png", 0, index, time.Now())
		if err != nil {
			return err
		}
	}
	return nil
}

type sessionScanner interface {
	Scan(dest ...any) error
}

func scanSession(scanner sessionScanner) (models.Session, error) {
	var session models.Session
	var email, phone, layoutID, paperSize, frameID, customerTokenHash sql.NullString
	var finalKey, finalURL, printKey, printURL, animatedKey, animatedURL sql.NullString
	err := scanner.Scan(
		&session.ID, &session.ShortCode, &email, &phone, &layoutID, &paperSize, &frameID, &session.Status,
		&finalKey, &finalURL, &printKey, &printURL,
		&animatedKey, &animatedURL,
		&session.DownloadURL, &customerTokenHash, &session.CreatedAt, &session.UpdatedAt, &session.ExpiresAt,
	)
	if err != nil {
		return models.Session{}, err
	}
	session.Email = nullableStringPtr(email)
	session.Phone = nullableStringPtr(phone)
	session.LayoutID = nullableStringPtr(layoutID)
	session.PaperSize = nullableStringPtr(paperSize)
	session.FrameID = nullableStringPtr(frameID)
	if customerTokenHash.Valid {
		session.CustomerTokenHash = customerTokenHash.String
	}
	if finalURL.Valid {
		session.FinalImage = &models.StoredImage{Key: finalKey.String, URL: finalURL.String}
	}
	if printURL.Valid {
		session.PrintImage = &models.StoredImage{Key: printKey.String, URL: printURL.String}
	}
	if animatedURL.Valid {
		session.AnimatedImage = &models.StoredImage{Key: animatedKey.String, URL: animatedURL.String}
	}
	return session, nil
}

func scanMessages(rows *sql.Rows) []models.Message {
	messages := []models.Message{}
	for rows.Next() {
		var message models.Message
		var recipient sql.NullString
		if err := rows.Scan(&message.ID, &message.SessionID, &message.Channel, &recipient, &message.DownloadURL, &message.Status, &message.CreatedAt); err == nil {
			message.Recipient = nullableStringPtr(recipient)
			messages = append(messages, message)
		}
	}
	return messages
}

type paymentScanner interface {
	Scan(dest ...any) error
}

func scanPayment(scanner paymentScanner) (models.Payment, error) {
	var payment models.Payment
	var providerRef, snapToken, checkoutURL, voucherID sql.NullString
	err := scanner.Scan(
		&payment.ID,
		&payment.SessionID,
		&payment.Provider,
		&payment.Amount,
		&payment.Currency,
		&payment.Status,
		&providerRef,
		&snapToken,
		&checkoutURL,
		&voucherID,
		&payment.OriginalAmount,
		&payment.DiscountAmount,
		&payment.CreatedAt,
		&payment.UpdatedAt,
	)
	payment.ProviderRef = nullableStringPtr(providerRef)
	payment.SnapToken = nullableStringPtr(snapToken)
	payment.CheckoutURL = nullableStringPtr(checkoutURL)
	payment.VoucherID = nullableStringPtr(voucherID)
	return payment, err
}

func scanPayments(rows *sql.Rows) []models.Payment {
	payments := []models.Payment{}
	for rows.Next() {
		if payment, err := scanPayment(rows); err == nil {
			payments = append(payments, payment)
		}
	}
	return payments
}

func scanPaymentLogs(rows *sql.Rows) []models.PaymentLog {
	logs := []models.PaymentLog{}
	for rows.Next() {
		var log models.PaymentLog
		var statusBefore, providerRef sql.NullString
		if err := rows.Scan(
			&log.ID,
			&log.PaymentID,
			&log.SessionID,
			&log.Event,
			&log.Provider,
			&log.Amount,
			&log.Currency,
			&statusBefore,
			&log.StatusAfter,
			&providerRef,
			&log.RequestPayload,
			&log.IP,
			&log.UserAgent,
			&log.CreatedAt,
		); err == nil {
			log.StatusBefore = nullableStringPtr(statusBefore)
			log.ProviderRef = nullableStringPtr(providerRef)
			logs = append(logs, log)
		}
	}
	return logs
}

func scanAdminUser(scanner sessionScanner) (models.AdminUser, error) {
	var user models.AdminUser
	err := scanner.Scan(&user.ID, &user.Email, &user.PasswordHash, &user.Role, &user.CreatedAt, &user.UpdatedAt)
	return user, err
}

func nullableStringPtr(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}

func imageKey(image *models.StoredImage) *string {
	if image == nil {
		return nil
	}
	return &image.Key
}

func imageURL(image *models.StoredImage) *string {
	if image == nil {
		return nil
	}
	return &image.URL
}

func itoa(value int) string {
	if value == 0 {
		return "0"
	}
	digits := []byte{}
	for value > 0 {
		digits = append([]byte{byte('0' + value%10)}, digits...)
		value /= 10
	}
	return string(digits)
}

var _ Store = (*PostgresStore)(nil)

func (s *PostgresStore) ToggleTwoFactor(userID string, enabled bool) error {
	_, err := s.db.Exec(`UPDATE admin_users SET two_factor_enabled = $1 WHERE id = $2`, enabled, userID)
	return err
}

func (s *PostgresStore) UpsertLoginOTP(otp models.LoginOTP) error {
	_, err := s.db.Exec(`
		INSERT INTO login_otps (email, otp, expires_at, created_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (email) DO UPDATE SET
			otp = EXCLUDED.otp,
			expires_at = EXCLUDED.expires_at,
			created_at = EXCLUDED.created_at
	`, otp.Email, otp.OTP, otp.ExpiresAt, otp.CreatedAt)
	return err
}

func (s *PostgresStore) VerifyLoginOTP(email, otp string) bool {
	var expiresAt time.Time
	err := s.db.QueryRow(`
		SELECT expires_at FROM login_otps WHERE email = $1 AND otp = $2
	`, email, otp).Scan(&expiresAt)
	if err != nil {
		return false
	}
	return time.Now().Before(expiresAt)
}

func (s *PostgresStore) DeleteLoginOTP(email string) error {
	_, err := s.db.Exec(`DELETE FROM login_otps WHERE email = $1`, email)
	return err
}

func (s *PostgresStore) GetWalletSettings() models.WalletSettings {
	return models.WalletSettings{}
}

func (s *PostgresStore) SaveWalletSettings(settings models.WalletSettings) error {
	return nil
}

func (s *PostgresStore) ListWithdrawals() []models.Withdrawal {
	return []models.Withdrawal{}
}

func (s *PostgresStore) InsertWithdrawal(withdrawal models.Withdrawal) error {
	return nil
}

func (s *PostgresStore) UpdateWithdrawal(withdrawal models.Withdrawal) error {
	return nil
}

func (s *PostgresStore) WithdrawalsByAdmin(adminID string) []models.Withdrawal {
	return []models.Withdrawal{}
}

func (s *PostgresStore) ListFilters() []models.Filter {
	return []models.Filter{}
}

func (s *PostgresStore) UpsertFilter(filter models.Filter) error {
	return nil
}


func (p *PostgresStore) GetDeviceSettings() map[string]any {
	// Not implemented for postgres yet
	return make(map[string]any)
}

func (p *PostgresStore) UpdateDeviceSettings(settings map[string]any) error {
	// Not implemented for postgres yet
	return nil
}

func (p *PostgresStore) CreateProject(project models.Project) error {
	settingsJSON, err := json.Marshal(project.Settings)
	if err != nil {
		return err
	}

	_, err = p.db.Exec(`
		INSERT INTO projects (id, name, cover_image, settings, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, project.ID, project.Name, project.Cover, settingsJSON, project.CreatedAt, project.UpdatedAt)
	return err
}

func (p *PostgresStore) ListProjects() []models.Project {
	rows, err := p.db.Query(`
		SELECT id, name, cover_image, settings, created_at, updated_at
		FROM projects
		ORDER BY created_at DESC
	`)
	if err != nil {
		return []models.Project{}
	}
	defer rows.Close()

	var projects []models.Project
	for rows.Next() {
		var proj models.Project
		var settingsJSON []byte
		if err := rows.Scan(&proj.ID, &proj.Name, &proj.Cover, &settingsJSON, &proj.CreatedAt, &proj.UpdatedAt); err == nil {
			var settings map[string]any
			if err := json.Unmarshal(settingsJSON, &settings); err == nil {
				proj.Settings = settings
			}
			projects = append(projects, proj)
		}
	}
	if projects == nil {
		return []models.Project{}
	}
	return projects
}

func (p *PostgresStore) GetProject(id string) (models.Project, bool) {
	var proj models.Project
	var settingsJSON []byte
	err := p.db.QueryRow(`
		SELECT id, name, cover_image, settings, created_at, updated_at
		FROM projects
		WHERE id = $1
	`, id).Scan(&proj.ID, &proj.Name, &proj.Cover, &settingsJSON, &proj.CreatedAt, &proj.UpdatedAt)
	
	if err != nil {
		return models.Project{}, false
	}
	
	var settings map[string]any
	if err := json.Unmarshal(settingsJSON, &settings); err == nil {
		proj.Settings = settings
	}
	return proj, true
}

func (p *PostgresStore) UpdateProject(project models.Project) error {
	settingsJSON, err := json.Marshal(project.Settings)
	if err != nil {
		return err
	}

	res, err := p.db.Exec(`
		UPDATE projects
		SET name = $1, cover_image = $2, settings = $3, updated_at = $4
		WHERE id = $5
	`, project.Name, project.Cover, settingsJSON, time.Now(), project.ID)
	if err != nil {
		return err
	}

	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return os.ErrNotExist
	}
	return nil
}

func (p *PostgresStore) DeleteProject(id string) error {
	res, err := p.db.Exec(`DELETE FROM projects WHERE id = $1`, id)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return os.ErrNotExist
	}
	return nil
}

func (p *PostgresStore) ListSubscriptions() []models.Subscription {
	return nil
}
func (p *PostgresStore) UpsertSubscription(sub models.Subscription) error {
	return nil
}
func (p *PostgresStore) DeleteSubscription(id string) error {
	return nil
}

func (p *PostgresStore) ListFramesGif() []models.FrameGif {
	return nil
}
func (p *PostgresStore) UpsertFrameGif(frame models.FrameGif) error {
	return nil
}
func (p *PostgresStore) DeleteFrameGif(id string) error {
	return nil
}

func (p *PostgresStore) GetPaymentKey() models.PaymentKey {
	return models.PaymentKey{}
}
func (p *PostgresStore) SavePaymentKey(key models.PaymentKey) error {
	return nil
}
