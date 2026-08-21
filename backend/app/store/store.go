package store

import "urbanmenphoto/backend/app/models"

type Store interface {
	ListSessions() []models.Session
	FindSession(id string) (models.Session, bool)
	InsertSession(session models.Session) error
	UpdateSession(session models.Session) error
	DeleteSession(id string) (models.Session, error)

	InsertMessage(message models.Message) error
	ListMessages() []models.Message
	MessagesBySession(sessionID string) []models.Message

	ListPayments() []models.Payment
	FindPayment(id string) (models.Payment, bool)
	PaymentsBySession(sessionID string) []models.Payment
	InsertPayment(payment models.Payment) error
	UpdatePayment(payment models.Payment) error
	InsertPaymentLog(log models.PaymentLog) error
	ListPaymentLogs() []models.PaymentLog
	PaymentLogsByPayment(paymentID string) []models.PaymentLog

	ListFrames() []models.Frame
	UpsertFrame(frame models.Frame) error
	DeleteFrame(id string) error

	ListFilters() []models.Filter
	UpsertFilter(filter models.Filter) error
	DeleteFilter(id string) error

	ListVouchers() []models.Voucher
	UpsertVoucher(voucher models.Voucher) error
	DeleteVoucher(id string) error

	FindAdminUserByEmail(email string) (models.AdminUser, bool)
	FindAdminUserByID(id string) (models.AdminUser, bool)
	ListAdminUsers() []models.AdminUser
	UpsertAdminUser(user models.AdminUser) error
	DeleteAdminUser(id string) error
	InsertAdminToken(token models.AdminToken) error
	FindAdminTokenByHash(tokenHash string) (models.AdminToken, bool)
	UpdateAdminToken(token models.AdminToken) error
	DeleteAdminToken(tokenHash string) error
	ToggleTwoFactor(userID string, enabled bool) error

	UpsertLoginOTP(otp models.LoginOTP) error
	VerifyLoginOTP(email, otp string) bool
	DeleteLoginOTP(email string) error

	InsertAuditLog(log models.AuditLog) error
	ListAuditLogs() []models.AuditLog

	FindLoginAttempt(email string) (models.LoginAttempt, bool)
	UpsertLoginAttempt(attempt models.LoginAttempt) error

	GetWalletSettings() models.WalletSettings
	SaveWalletSettings(settings models.WalletSettings) error
	ListWithdrawals() []models.Withdrawal
	InsertWithdrawal(withdrawal models.Withdrawal) error

	GetDeviceSettings() map[string]any
	UpdateDeviceSettings(map[string]any) error

	CreateProject(project models.Project) error
	ListProjects() []models.Project
	GetProject(id string) (models.Project, bool)
	UpdateProject(project models.Project) error
	DeleteProject(id string) error

	ListSubscriptions() []models.Subscription
	UpsertSubscription(sub models.Subscription) error
	DeleteSubscription(id string) error

	ListFramesGif() []models.FrameGif
	UpsertFrameGif(frame models.FrameGif) error
	DeleteFrameGif(id string) error

	GetPaymentKey() models.PaymentKey
	SavePaymentKey(key models.PaymentKey) error
}
