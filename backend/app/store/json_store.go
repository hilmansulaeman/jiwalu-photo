package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"

	"urbanmenphoto/backend/app/models"
)

type JSONStore struct {
	mu   sync.Mutex
	path string
	data database
}

type database struct {
	Sessions      []models.Session      `json:"sessions"`
	Messages      []models.Message      `json:"messages"`
	Payments      []models.Payment      `json:"payments"`
	PaymentLogs   []models.PaymentLog   `json:"paymentLogs"`
	Frames        []models.Frame        `json:"frames"`
	Filters       []models.Filter       `json:"filters"`
	Vouchers      []models.Voucher      `json:"vouchers"`
	AdminUsers    []models.AdminUser    `json:"adminUsers"`
	AdminTokens   []models.AdminToken   `json:"adminTokens"`
	AuditLogs     []models.AuditLog     `json:"auditLogs"`
	LoginAttempts  []models.LoginAttempt `json:"loginAttempts"`
	LoginOTPs      []models.LoginOTP     `json:"loginOtps"`
	WalletSettings models.WalletSettings `json:"walletSettings"`
	Withdrawals    []models.Withdrawal   `json:"withdrawals"`
	DeviceSettings map[string]any `json:"deviceSettings"`
	Projects       []models.Project      `json:"projects"`
	Subscriptions  []models.Subscription `json:"subscriptions"`
	FramesGif      []models.FrameGif     `json:"framesGif"`
	PaymentKey     models.PaymentKey     `json:"paymentKey"`
}

func NewJSONStore(dataDir string) (*JSONStore, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, err
	}

	store := &JSONStore{
		path: filepath.Join(dataDir, "db.json"),
		data: database{
			Sessions:      []models.Session{},
			Messages:      []models.Message{},
			Payments:      []models.Payment{},
			PaymentLogs:   []models.PaymentLog{},
			Frames:        []models.Frame{},
			Filters:       []models.Filter{},
			Vouchers:      []models.Voucher{},
			AdminUsers:    []models.AdminUser{},
			AdminTokens:   []models.AdminToken{},
			AuditLogs:     []models.AuditLog{},
			LoginAttempts: []models.LoginAttempt{},
			LoginOTPs:     []models.LoginOTP{},
			WalletSettings: models.WalletSettings{},
			Withdrawals:    []models.Withdrawal{},
			DeviceSettings: map[string]any{},
			Projects:       []models.Project{},
			Subscriptions:  []models.Subscription{},
			FramesGif:      []models.FrameGif{},
			PaymentKey:     models.PaymentKey{},
		},
	}

	if err := store.load(); err != nil {
		return nil, err
	}

	return store, nil
}

func (s *JSONStore) load() error {
	file, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return s.persist()
	}
	if err != nil {
		return err
	}
	if len(file) == 0 {
		return s.persist()
	}
	return json.Unmarshal(file, &s.data)
}

func (s *JSONStore) persist() error {
	file, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, file, 0644)
}

func (s *JSONStore) save() error {
	return s.persist()
}

func (s *JSONStore) ListSessions() []models.Session {
	s.mu.Lock()
	defer s.mu.Unlock()

	sessions := make([]models.Session, len(s.data.Sessions))
	copy(sessions, s.data.Sessions)
	return sessions
}

func (s *JSONStore) FindSession(id string) (models.Session, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, session := range s.data.Sessions {
		if session.ID == id || session.ShortCode == id {
			return session, true
		}
	}
	return models.Session{}, false
}

func (s *JSONStore) InsertSession(session models.Session) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.data.Sessions = append([]models.Session{session}, s.data.Sessions...)
	return s.persist()
}

func (s *JSONStore) UpdateSession(session models.Session) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index, item := range s.data.Sessions {
		if item.ID == session.ID {
			s.data.Sessions[index] = session
			return s.persist()
		}
	}
	return os.ErrNotExist
}

func (s *JSONStore) DeleteSession(id string) (models.Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index, session := range s.data.Sessions {
		if session.ID == id || session.ShortCode == id {
			s.data.Sessions = append(s.data.Sessions[:index], s.data.Sessions[index+1:]...)
			messages := make([]models.Message, 0, len(s.data.Messages))
			for _, message := range s.data.Messages {
				if message.SessionID != session.ID {
					messages = append(messages, message)
				}
			}
			s.data.Messages = messages
			payments := make([]models.Payment, 0, len(s.data.Payments))
			for _, payment := range s.data.Payments {
				if payment.SessionID != session.ID {
					payments = append(payments, payment)
				}
			}
			s.data.Payments = payments
			return session, s.persist()
		}
	}

	return models.Session{}, os.ErrNotExist
}

func (s *JSONStore) InsertMessage(message models.Message) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.data.Messages = append([]models.Message{message}, s.data.Messages...)
	return s.persist()
}

func (s *JSONStore) ListMessages() []models.Message {
	s.mu.Lock()
	defer s.mu.Unlock()

	messages := make([]models.Message, len(s.data.Messages))
	copy(messages, s.data.Messages)
	return messages
}

func (s *JSONStore) MessagesBySession(sessionID string) []models.Message {
	s.mu.Lock()
	defer s.mu.Unlock()

	messages := []models.Message{}
	for _, message := range s.data.Messages {
		if message.SessionID == sessionID {
			messages = append(messages, message)
		}
	}
	return messages
}

func (s *JSONStore) ListPayments() []models.Payment {
	s.mu.Lock()
	defer s.mu.Unlock()

	payments := make([]models.Payment, len(s.data.Payments))
	copy(payments, s.data.Payments)
	return payments
}

func (s *JSONStore) FindPayment(id string) (models.Payment, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, payment := range s.data.Payments {
		if payment.ID == id {
			return payment, true
		}
	}
	return models.Payment{}, false
}

func (s *JSONStore) PaymentsBySession(sessionID string) []models.Payment {
	s.mu.Lock()
	defer s.mu.Unlock()

	payments := []models.Payment{}
	for _, payment := range s.data.Payments {
		if payment.SessionID == sessionID {
			payments = append(payments, payment)
		}
	}
	return payments
}

func (s *JSONStore) InsertPayment(payment models.Payment) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.data.Payments = append([]models.Payment{payment}, s.data.Payments...)
	return s.persist()
}

func (s *JSONStore) UpdatePayment(payment models.Payment) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index, item := range s.data.Payments {
		if item.ID == payment.ID {
			s.data.Payments[index] = payment
			return s.persist()
		}
	}
	return os.ErrNotExist
}

func (s *JSONStore) InsertPaymentLog(log models.PaymentLog) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.data.PaymentLogs = append([]models.PaymentLog{log}, s.data.PaymentLogs...)
	if len(s.data.PaymentLogs) > 10000 {
		s.data.PaymentLogs = s.data.PaymentLogs[:10000]
	}
	return s.persist()
}

func (s *JSONStore) ListPaymentLogs() []models.PaymentLog {
	s.mu.Lock()
	defer s.mu.Unlock()

	logs := make([]models.PaymentLog, len(s.data.PaymentLogs))
	copy(logs, s.data.PaymentLogs)
	return logs
}

func (s *JSONStore) PaymentLogsByPayment(paymentID string) []models.PaymentLog {
	s.mu.Lock()
	defer s.mu.Unlock()

	logs := []models.PaymentLog{}
	for _, log := range s.data.PaymentLogs {
		if log.PaymentID == paymentID {
			logs = append(logs, log)
		}
	}
	return logs
}

func (s *JSONStore) ListFrames() []models.Frame {
	s.mu.Lock()
	defer s.mu.Unlock()

	frames := make([]models.Frame, len(s.data.Frames))
	copy(frames, s.data.Frames)
	return frames
}

func (s *JSONStore) UpsertFrame(frame models.Frame) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index, item := range s.data.Frames {
		if item.ID == frame.ID {
			s.data.Frames[index] = frame
			return s.persist()
		}
	}

	s.data.Frames = append([]models.Frame{frame}, s.data.Frames...)
	return s.persist()
}

func (s *JSONStore) DeleteFrame(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, frame := range s.data.Frames {
		if frame.ID == id {
			s.data.Frames = append(s.data.Frames[:i], s.data.Frames[i+1:]...)
			return s.persist()
		}
	}
	return nil
}

func (s *JSONStore) ListFilters() []models.Filter {
	s.mu.Lock()
	defer s.mu.Unlock()
	filters := make([]models.Filter, len(s.data.Filters))
	copy(filters, s.data.Filters)
	return filters
}

func (s *JSONStore) UpsertFilter(filter models.Filter) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, f := range s.data.Filters {
		if f.ID == filter.ID {
			s.data.Filters[i] = filter
			return s.persist()
		}
	}

	s.data.Filters = append(s.data.Filters, filter)
	return s.persist()
}

func (s *JSONStore) DeleteFilter(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, f := range s.data.Filters {
		if f.ID == id {
			s.data.Filters = append(s.data.Filters[:i], s.data.Filters[i+1:]...)
			return s.persist()
		}
	}
	return nil
}

func (s *JSONStore) ListVouchers() []models.Voucher {
	s.mu.Lock()
	defer s.mu.Unlock()

	vouchers := make([]models.Voucher, len(s.data.Vouchers))
	copy(vouchers, s.data.Vouchers)
	return vouchers
}

func (s *JSONStore) UpsertVoucher(voucher models.Voucher) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index, item := range s.data.Vouchers {
		if item.ID == voucher.ID {
			s.data.Vouchers[index] = voucher
			return s.persist()
		}
	}

	s.data.Vouchers = append([]models.Voucher{voucher}, s.data.Vouchers...)
	return s.persist()
}

func (s *JSONStore) DeleteVoucher(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index, voucher := range s.data.Vouchers {
		if voucher.ID == id {
			s.data.Vouchers = append(s.data.Vouchers[:index], s.data.Vouchers[index+1:]...)
			return s.persist()
		}
	}
	return os.ErrNotExist
}

func (s *JSONStore) FindAdminUserByEmail(email string) (models.AdminUser, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, user := range s.data.AdminUsers {
		if user.Email == email {
			return user, true
		}
	}
	return models.AdminUser{}, false
}

func (s *JSONStore) FindAdminUserByID(id string) (models.AdminUser, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, user := range s.data.AdminUsers {
		if user.ID == id {
			return user, true
		}
	}
	return models.AdminUser{}, false
}

func (s *JSONStore) ListAdminUsers() []models.AdminUser {
	s.mu.Lock()
	defer s.mu.Unlock()

	users := make([]models.AdminUser, len(s.data.AdminUsers))
	copy(users, s.data.AdminUsers)
	return users
}

func (s *JSONStore) UpsertAdminUser(user models.AdminUser) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index, item := range s.data.AdminUsers {
		if item.ID == user.ID || item.Email == user.Email {
			s.data.AdminUsers[index] = user
			return s.persist()
		}
	}

	s.data.AdminUsers = append(s.data.AdminUsers, user)
	return s.persist()
}

func (s *JSONStore) DeleteAdminUser(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index, user := range s.data.AdminUsers {
		if user.ID == id {
			s.data.AdminUsers = append(s.data.AdminUsers[:index], s.data.AdminUsers[index+1:]...)
			tokens := make([]models.AdminToken, 0, len(s.data.AdminTokens))
			for _, token := range s.data.AdminTokens {
				if token.UserID != id {
					tokens = append(tokens, token)
				}
			}
			s.data.AdminTokens = tokens
			return s.persist()
		}
	}
	return os.ErrNotExist
}

func (s *JSONStore) InsertAdminToken(token models.AdminToken) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tokens := make([]models.AdminToken, 0, len(s.data.AdminTokens)+1)
	for _, item := range s.data.AdminTokens {
		if item.UserID != token.UserID && item.ExpiresAt.After(token.CreatedAt) {
			tokens = append(tokens, item)
		}
	}
	tokens = append(tokens, token)
	s.data.AdminTokens = tokens
	return s.persist()
}

func (s *JSONStore) FindAdminTokenByHash(tokenHash string) (models.AdminToken, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, item := range s.data.AdminTokens {
		if item.TokenHash == tokenHash {
			return item, true
		}
	}
	return models.AdminToken{}, false
}

func (s *JSONStore) UpdateAdminToken(token models.AdminToken) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index, item := range s.data.AdminTokens {
		if item.TokenHash == token.TokenHash {
			s.data.AdminTokens[index] = token
			return s.persist()
		}
	}
	return os.ErrNotExist
}

func (s *JSONStore) DeleteAdminToken(tokenHash string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index, item := range s.data.AdminTokens {
		if item.TokenHash == tokenHash {
			s.data.AdminTokens = append(s.data.AdminTokens[:index], s.data.AdminTokens[index+1:]...)
			return s.persist()
		}
	}
	return os.ErrNotExist
}

func (s *JSONStore) InsertAuditLog(log models.AuditLog) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.data.AuditLogs = append([]models.AuditLog{log}, s.data.AuditLogs...)
	if len(s.data.AuditLogs) > 5000 {
		s.data.AuditLogs = s.data.AuditLogs[:5000]
	}
	return s.persist()
}

func (s *JSONStore) ListAuditLogs() []models.AuditLog {
	s.mu.Lock()
	defer s.mu.Unlock()

	logs := make([]models.AuditLog, len(s.data.AuditLogs))
	copy(logs, s.data.AuditLogs)
	return logs
}

func (s *JSONStore) FindLoginAttempt(email string) (models.LoginAttempt, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, attempt := range s.data.LoginAttempts {
		if attempt.Email == email {
			return attempt, true
		}
	}
	return models.LoginAttempt{}, false
}

func (s *JSONStore) UpsertLoginAttempt(attempt models.LoginAttempt) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index, item := range s.data.LoginAttempts {
		if item.Email == attempt.Email {
			s.data.LoginAttempts[index] = attempt
			return s.persist()
		}
	}
	s.data.LoginAttempts = append(s.data.LoginAttempts, attempt)
	return s.persist()
}

// Wallet Methods

func (s *JSONStore) GetWalletSettings() models.WalletSettings {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.data.WalletSettings
}

func (s *JSONStore) SaveWalletSettings(settings models.WalletSettings) error {
	s.mu.Lock()
	s.data.WalletSettings = settings
	s.mu.Unlock()
	return s.persist()
}

func (s *JSONStore) ListWithdrawals() []models.Withdrawal {
	s.mu.Lock()
	defer s.mu.Unlock()
	cpy := make([]models.Withdrawal, len(s.data.Withdrawals))
	copy(cpy, s.data.Withdrawals)
	return cpy
}

func (s *JSONStore) InsertWithdrawal(withdrawal models.Withdrawal) error {
	s.mu.Lock()
	s.data.Withdrawals = append(s.data.Withdrawals, withdrawal)
	s.mu.Unlock()
	return s.persist()
}

func (s *JSONStore) ToggleTwoFactor(userID string, enabled bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index, item := range s.data.AdminUsers {
		if item.ID == userID {
			s.data.AdminUsers[index].TwoFactorEnabled = enabled
			return s.persist()
		}
	}
	return os.ErrNotExist
}

func (s *JSONStore) UpsertLoginOTP(otp models.LoginOTP) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index, item := range s.data.LoginOTPs {
		if item.Email == otp.Email {
			s.data.LoginOTPs[index] = otp
			return s.persist()
		}
	}
	s.data.LoginOTPs = append(s.data.LoginOTPs, otp)
	return s.persist()
}

func (s *JSONStore) VerifyLoginOTP(email, otp string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, item := range s.data.LoginOTPs {
		if item.Email == email && item.OTP == otp {
			return time.Now().Before(item.ExpiresAt)
		}
	}
	return false
}

func (s *JSONStore) DeleteLoginOTP(email string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index, item := range s.data.LoginOTPs {
		if item.Email == email {
			s.data.LoginOTPs = append(s.data.LoginOTPs[:index], s.data.LoginOTPs[index+1:]...)
			return s.persist()
		}
	}
	return nil
}

func (s *JSONStore) GetDeviceSettings() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.data.DeviceSettings == nil {
		s.data.DeviceSettings = make(map[string]any)
	}
	// copy map
	cp := make(map[string]any)
	for k, v := range s.data.DeviceSettings {
		cp[k] = v
	}
	return cp
}

func (s *JSONStore) UpdateDeviceSettings(settings map[string]any) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.DeviceSettings = settings
	return s.save()
}

func (s *JSONStore) CreateProject(project models.Project) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// check if ID already exists
	for _, p := range s.data.Projects {
		if p.ID == project.ID {
			return errors.New("project ID already exists")
		}
	}

	project.CreatedAt = time.Now()
	project.UpdatedAt = time.Now()
	s.data.Projects = append(s.data.Projects, project)
	return s.save()
}

func (s *JSONStore) ListProjects() []models.Project {
	s.mu.Lock()
	defer s.mu.Unlock()

	projects := make([]models.Project, len(s.data.Projects))
	copy(projects, s.data.Projects)
	return projects
}

func (s *JSONStore) GetProject(id string) (models.Project, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, p := range s.data.Projects {
		if p.ID == id {
			return p, true
		}
	}
	return models.Project{}, false
}

func (s *JSONStore) UpdateProject(project models.Project) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, p := range s.data.Projects {
		if p.ID == project.ID {
			project.CreatedAt = p.CreatedAt
			project.UpdatedAt = time.Now()
			s.data.Projects[i] = project
			return s.save()
		}
	}
	return errors.New("project not found")
}

func (s *JSONStore) DeleteProject(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, p := range s.data.Projects {
		if p.ID == id {
			s.data.Projects = append(s.data.Projects[:i], s.data.Projects[i+1:]...)
			return s.save()
		}
	}
	return errors.New("project not found")
}

func (s *JSONStore) ListSubscriptions() []models.Subscription {
	s.mu.Lock()
	defer s.mu.Unlock()

	subs := make([]models.Subscription, len(s.data.Subscriptions))
	copy(subs, s.data.Subscriptions)
	return subs
}

func (s *JSONStore) UpsertSubscription(sub models.Subscription) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, p := range s.data.Subscriptions {
		if p.ID == sub.ID {
			s.data.Subscriptions[i] = sub
			return s.save()
		}
	}
	s.data.Subscriptions = append(s.data.Subscriptions, sub)
	return s.save()
}

func (s *JSONStore) DeleteSubscription(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, p := range s.data.Subscriptions {
		if p.ID == id {
			s.data.Subscriptions = append(s.data.Subscriptions[:i], s.data.Subscriptions[i+1:]...)
			return s.save()
		}
	}
	return errors.New("subscription not found")
}

func (s *JSONStore) ListFramesGif() []models.FrameGif {
	s.mu.Lock()
	defer s.mu.Unlock()

	frames := make([]models.FrameGif, len(s.data.FramesGif))
	copy(frames, s.data.FramesGif)
	return frames
}

func (s *JSONStore) UpsertFrameGif(frame models.FrameGif) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, f := range s.data.FramesGif {
		if f.ID == frame.ID {
			s.data.FramesGif[i] = frame
			return s.save()
		}
	}
	s.data.FramesGif = append(s.data.FramesGif, frame)
	return s.save()
}

func (s *JSONStore) DeleteFrameGif(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, f := range s.data.FramesGif {
		if f.ID == id {
			s.data.FramesGif = append(s.data.FramesGif[:i], s.data.FramesGif[i+1:]...)
			return s.save()
		}
	}
	return errors.New("frame gif not found")
}

func (s *JSONStore) GetPaymentKey() models.PaymentKey {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.data.PaymentKey
}

func (s *JSONStore) SavePaymentKey(key models.PaymentKey) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.PaymentKey = key
	return s.save()
}
