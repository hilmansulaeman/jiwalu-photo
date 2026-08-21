package models

import "time"

type StoredImage struct {
	Key      string `json:"key"`
	URL      string `json:"url"`
	MimeType string `json:"mimeType"`
	Size     int64  `json:"size"`
}

type Project struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	Cover     string         `json:"coverImage,omitempty"`
	Settings  map[string]any `json:"settings"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
}

type Session struct {
	ID                string       `json:"id"`
	ShortCode         string       `json:"shortCode"`
	Email             *string      `json:"email"`
	Phone             *string      `json:"phone"`
	LayoutID          *string      `json:"layoutId"`
	PaperSize         *string      `json:"paperSize"`
	FrameID           *string      `json:"frameId"`
	Status            string       `json:"status"`
	FinalImage        *StoredImage `json:"finalImage"`
	PrintImage        *StoredImage `json:"printImage,omitempty"`
	AnimatedImage     *StoredImage `json:"animatedImage,omitempty"`
	Images            []string     `json:"images"`
	DownloadURL       string       `json:"downloadUrl"`
	CustomerTokenHash string       `json:"customerTokenHash,omitempty"`
	CustomerToken     string       `json:"customerToken,omitempty"`
	CreatedAt         time.Time    `json:"createdAt"`
	UpdatedAt         time.Time    `json:"updatedAt"`
	ExpiresAt         time.Time    `json:"expiresAt"`
}

type Gallery struct {
	SessionID     string       `json:"sessionId"`
	Status        string       `json:"status"`
	FinalImage    *StoredImage `json:"finalImage"`
	AnimatedImage *StoredImage `json:"animatedImage,omitempty"`
	Images        []string     `json:"images"`
	DownloadURL   string       `json:"downloadUrl"`
	ExpiresAt     time.Time    `json:"expiresAt"`
	Expired       bool         `json:"expired"`
}

type Message struct {
	ID          string    `json:"id"`
	SessionID   string    `json:"sessionId"`
	Channel     string    `json:"channel"`
	Recipient   *string   `json:"recipient"`
	DownloadURL string    `json:"downloadUrl"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"createdAt"`
}

type AdminSessionDetail struct {
	Session   Session    `json:"session"`
	Messages  []Message  `json:"messages"`
	Payments  []Payment  `json:"payments"`
	AuditLogs []AuditLog `json:"auditLogs"`
}

type Payment struct {
	ID          string    `json:"id"`
	SessionID   string    `json:"sessionId"`
	Provider    string    `json:"provider"`
	Amount      int64     `json:"amount"`
	Currency    string    `json:"currency"`
	Status      string    `json:"status"`
	ProviderRef *string   `json:"providerRef,omitempty"`
	SnapToken      *string   `json:"snapToken,omitempty"`
	CheckoutURL    *string   `json:"checkoutUrl,omitempty"`
	QRString       *string   `json:"qrString,omitempty"`
	QRImageData    *string   `json:"qrImageData,omitempty"`
	VoucherID      *string   `json:"voucherId,omitempty"`
	OriginalAmount int64     `json:"originalAmount"`
	DiscountAmount int64     `json:"discountAmount"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type PaymentLog struct {
	ID             string    `json:"id"`
	PaymentID      string    `json:"paymentId"`
	SessionID      string    `json:"sessionId"`
	Event          string    `json:"event"`
	Provider       string    `json:"provider"`
	Amount         int64     `json:"amount"`
	Currency       string    `json:"currency"`
	StatusBefore   *string   `json:"statusBefore"`
	StatusAfter    string    `json:"statusAfter"`
	ProviderRef    *string   `json:"providerRef"`
	RequestPayload string    `json:"requestPayload"`
	IP             string    `json:"ip"`
	UserAgent      string    `json:"userAgent"`
	CreatedAt      time.Time `json:"createdAt"`
}

type Transaction struct {
	ID        string    `json:"id"`
	SessionID string    `json:"sessionId"`
	Provider  string    `json:"provider"`
	Amount    int64     `json:"amount"`
	Currency  string    `json:"currency"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

type Frame struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Category     string    `json:"category"`
	LayoutCount  int       `json:"layoutCount"`
	ImageURL     string    `json:"imageUrl"`
	SlotJSON     string    `json:"slotJson"`
	TemplateType string    `json:"templateType"`
	PaperSize    string    `json:"paperSize"`
	Orientation  string    `json:"orientation"`
	PrintMode    string    `json:"printMode"`
	PrintCopies  int       `json:"printCopies"`
	Active       bool      `json:"active"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type Filter struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Category  string    `json:"category"`
	CSS       string    `json:"css"`
	Active    bool      `json:"active"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Voucher struct {
	ID          string     `json:"id"`
	Code        string     `json:"code"`
	Name        string     `json:"name"`
	Type        string     `json:"type"`
	Value       int64      `json:"value"`
	MinAmount   int64      `json:"minAmount"`
	MaxDiscount int64      `json:"maxDiscount"`
	UsageLimit  int        `json:"usageLimit"`
	UsedCount   int        `json:"usedCount"`
	Active      bool       `json:"active"`
	CreatedBy   *string    `json:"createdBy,omitempty"`
	StartsAt    *time.Time `json:"startsAt,omitempty"`
	EndsAt      *time.Time `json:"endsAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

type Stats struct {
	TotalSessions     int   `json:"totalSessions"`
	FinalizedSessions int   `json:"finalizedSessions"`
	SessionsToday     int   `json:"sessionsToday"`
	TotalImages       int   `json:"totalImages"`
	TotalPayments     int   `json:"totalPayments"`
	PaidPayments      int   `json:"paidPayments"`
	Revenue           int64 `json:"revenue"`
}

type AdminUser struct {
	ID           string    `json:"id"`
	Email            string    `json:"email"`
	PasswordHash     string    `json:"passwordHash"`
	Role             string    `json:"role"`
	GoogleID         *string   `json:"googleId,omitempty"`
	AvatarURL        *string   `json:"avatarUrl,omitempty"`
	TwoFactorEnabled bool      `json:"twoFactorEnabled"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

type AdminUserView struct {
	ID               string    `json:"id"`
	Email            string    `json:"email"`
	Role             string    `json:"role"`
	GoogleID         *string   `json:"googleId,omitempty"`
	AvatarURL        *string   `json:"avatarUrl,omitempty"`
	TwoFactorEnabled bool      `json:"twoFactorEnabled"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

type LoginOTP struct {
	Email     string    `json:"email"`
	OTP       string    `json:"otp"`
	ExpiresAt time.Time `json:"expiresAt"`
	CreatedAt time.Time `json:"createdAt"`
}

type AdminToken struct {
	TokenHash  string     `json:"tokenHash"`
	UserID     string     `json:"userId"`
	ExpiresAt  time.Time  `json:"expiresAt"`
	CreatedAt  time.Time  `json:"createdAt"`
	LastUsedAt *time.Time `json:"lastUsedAt,omitempty"`
}

type AuditLog struct {
	ID        string         `json:"id"`
	ActorID   *string        `json:"actorId"`
	Action    string         `json:"action"`
	Resource  string         `json:"resource"`
	Metadata  map[string]any `json:"metadata,omitempty"`
	IP        string         `json:"ip"`
	UserAgent string         `json:"userAgent"`
	Success   bool           `json:"success"`
	CreatedAt time.Time      `json:"createdAt"`
}

type LoginAttempt struct {
	Email         string     `json:"email"`
	FailedCount   int        `json:"failedCount"`
	LockedUntil   *time.Time `json:"lockedUntil,omitempty"`
	LastAttemptAt time.Time  `json:"lastAttemptAt"`
}

type AdminLoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AdminLoginResponse struct {
	Authenticated bool   `json:"authenticated"`
	Requires2FA   bool   `json:"requires2FA,omitempty"`
	Token         string `json:"token,omitempty"`
	ExpiresAt     string `json:"expiresAt,omitempty"`
	Role          string `json:"role,omitempty"`
}

type AdminVerifyOTPRequest struct {
	Email string `json:"email"`
	OTP   string `json:"otp"`
}

type CreateAdminUserRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

type UpdateAdminUserRequest struct {
	Password string `json:"password"`
	Role     string `json:"role"`
}

type CreateSessionRequest struct {
	ID        string  `json:"id"`
	Email     *string `json:"email"`
	Phone     *string `json:"phone"`
	LayoutID  *string `json:"layoutId"`
	PaperSize *string `json:"paperSize"`
	FrameID   *string `json:"frameId"`
	Status    string  `json:"status"`
}

type FinalizeSessionRequest struct {
	Email         *string  `json:"email"`
	Phone         *string  `json:"phone"`
	LayoutID      *string  `json:"layoutId"`
	PaperSize     *string  `json:"paperSize"`
	FrameID       *string  `json:"frameId"`
	FinalImage    string   `json:"finalImage"`
	PrintImage    string   `json:"printImage"`
	AnimatedImage string   `json:"animatedImage"`
	Images        []string `json:"images"`
}

type SendLinkRequest struct {
	Channel     string  `json:"channel"`
	Recipient   *string `json:"recipient"`
	Email       *string `json:"email"`
	Phone       *string `json:"phone"`
	DownloadURL *string `json:"downloadUrl"`
}

type PatchSessionRequest struct {
	Email     *string `json:"email"`
	Phone     *string `json:"phone"`
	LayoutID  *string `json:"layoutId"`
	PaperSize *string `json:"paperSize"`
	FrameID   *string `json:"frameId"`
	Status    *string `json:"status"`
}

type CreatePaymentRequest struct {
	SessionID   string `json:"sessionId"`
	Provider    string `json:"provider"`
	Amount      int64  `json:"amount"`
	Currency    string `json:"currency"`
	VoucherCode string `json:"voucherCode,omitempty"`
}

type PaymentWebhookRequest struct {
	PaymentID         string `json:"paymentId"`
	SessionID         string `json:"sessionId"`
	Status            string `json:"status"`
	OrderID           string `json:"order_id"`
	TransactionStatus string `json:"transaction_status"`
	FraudStatus       string `json:"fraud_status"`
	StatusCode        string `json:"status_code"`
	GrossAmount       string `json:"gross_amount"`
	SignatureKey      string `json:"signature_key"`
	PaymentType       string `json:"payment_type"`
	TransactionID     string `json:"transaction_id"`
}

type ErrorEventRequest struct {
	Category  string         `json:"category"`
	SessionID string         `json:"sessionId"`
	Message   string         `json:"message"`
	Source    string         `json:"source"`
	Metadata  map[string]any `json:"metadata"`
}

type UpsertFrameRequest struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Category     string `json:"category"`
	LayoutCount  int    `json:"layoutCount"`
	ImageURL     string `json:"imageUrl"`
	SlotJSON     string `json:"slotJson"`
	TemplateType string `json:"templateType"`
	PaperSize    string `json:"paperSize"`
	Orientation  string `json:"orientation"`
	PrintMode    string `json:"printMode"`
	PrintCopies  int    `json:"printCopies"`
	Active       *bool  `json:"active"`
}

type UpsertVoucherRequest struct {
	ID          string     `json:"id"`
	Code        string     `json:"code"`
	Name        string     `json:"name"`
	Type        string     `json:"type"`
	Value       int64      `json:"value"`
	MinAmount   int64      `json:"minAmount"`
	MaxDiscount int64      `json:"maxDiscount"`
	UsageLimit  int        `json:"usageLimit"`
	Active      *bool      `json:"active"`
	StartsAt    *time.Time `json:"startsAt"`
	EndsAt      *time.Time `json:"endsAt"`
}

type CleanupResult struct {
	DeletedSessions int `json:"deletedSessions"`
	DeletedFiles    int `json:"deletedFiles"`
}

type StorageStats struct {
	StorageDir        string `json:"storageDir"`
	TotalSessions     int    `json:"totalSessions"`
	ExpiredSessions   int    `json:"expiredSessions"`
	FinalizedSessions int    `json:"finalizedSessions"`
	PaidSessions      int    `json:"paidSessions"`
	StorageFiles      int    `json:"storageFiles"`
	StorageBytes      int64  `json:"storageBytes"`
}

type PaginatedResponse struct {
	Items      any `json:"items"`
	Total      int `json:"total"`
	Page       int `json:"page"`
	PageSize   int `json:"pageSize"`
	TotalPages int `json:"totalPages"`
}

type WalletSettings struct {
	AccountName    string `json:"accountName"`
	AccountNumber  string `json:"accountNumber"`
	BankName       string `json:"bankName"`
	WithdrawalPref string `json:"withdrawalPref"`
}

type Withdrawal struct {
	ID        string    `json:"id"`
	Amount    int64     `json:"amount"`
	Fee       int64     `json:"fee"`
	Status    string    `json:"status"` // pending, completed, failed
	Reference string    `json:"reference"`
	CreatedAt time.Time `json:"createdAt"`
}

type Subscription struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Price        int64     `json:"price"`
	DurationDays int       `json:"durationDays"`
	Features     []string  `json:"features"`
	Active       bool      `json:"active"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type PaymentKey struct {
	MidtransClientKey string `json:"midtransClientKey"`
	MidtransServerKey string `json:"midtransServerKey"`
	XenditAPIKey      string `json:"xenditApiKey"`
	ActiveGateway     string `json:"activeGateway"`
}

type FrameGif struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	ImageURL     string    `json:"imageUrl"`
	SlotJSON     string    `json:"slotJson"`
	Active       bool      `json:"active"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}
