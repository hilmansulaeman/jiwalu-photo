package httpapi

import (
	"bytes"
	"crypto/rand"
	"crypto/sha512"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	mathrand "math/rand"
	"net/http"
	"net/mail"
	"net/smtp"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"urbanmenphoto/backend/app/auth"
	"urbanmenphoto/backend/app/config"
	"urbanmenphoto/backend/app/models"
	"urbanmenphoto/backend/app/store"

	"github.com/midtrans/midtrans-go"
	"github.com/midtrans/midtrans-go/snap"
)

type Server struct {
	cfg     config.Config
	store   store.Store
	limiter *rateLimiter
}

type response struct {
	Data  any       `json:"data,omitempty"`
	Error *apiError `json:"error,omitempty"`
}

type apiError struct {
	Message string `json:"message"`
}

type imageData struct {
	MimeType string
	Ext      string
	Bytes    []byte
}

var dataURLPattern = regexp.MustCompile(`^data:([^;]+);base64,(.+)$`)
var emailPattern = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)
var phonePattern = regexp.MustCompile(`^\+?[0-9]{8,16}$`)

const (
	maxSessionImages    = 16
	maxDataURLImageSize = 8 * 1024 * 1024
)

func NewServer(cfg config.Config, jsonStore store.Store) *Server {
	return &Server{
		cfg:     cfg,
		store:   jsonStore,
		limiter: newRateLimiter(time.Minute),
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/swagger", s.handleSwaggerUI)
	mux.HandleFunc("/swagger/openapi.yaml", s.handleSwaggerSpec)
	mux.HandleFunc("/api/galleries/", s.handleGalleryByID)
	mux.HandleFunc("/api/sessions", s.handleSessions)
	mux.HandleFunc("/api/sessions/", s.handleSessionByID)
	mux.HandleFunc("/api/payments", s.handlePayments)
	mux.HandleFunc("/api/payments/", s.handlePaymentByID)
	mux.HandleFunc("/api/events/errors", s.handleErrorEvents)
	mux.HandleFunc("/api/frames", s.handleFrames)
	mux.HandleFunc("/api/settings", s.handleSettings)
	mux.HandleFunc("/api/projects", s.handlePublicProjects)
	mux.HandleFunc("/api/dslr/cameras", s.handleDSLRCameras)
	mux.HandleFunc("/api/dslr/capture", s.handleDSLRCapture)
	mux.HandleFunc("/api/admin/auth/login", s.handleAdminLogin)
	mux.HandleFunc("/api/admin/auth/login/verify-otp", s.handleAdminVerifyOTP)
	mux.HandleFunc("/api/admin/auth/2fa/toggle", s.handleAdminToggle2FA)
	mux.HandleFunc("/api/admin/auth/logout", s.handleAdminLogout)
	mux.HandleFunc("/api/admin/auth/me", s.handleAdminMe)
	mux.HandleFunc("/api/auth/google/login", s.handleGoogleLogin)
	mux.HandleFunc("/api/auth/google/callback", s.handleGoogleCallback)
	mux.HandleFunc("/api/auth/google/verify", s.handleGoogleVerify)
	mux.HandleFunc("/api/admin/users", s.handleAdminUsers)
	mux.HandleFunc("/api/admin/users/", s.handleAdminUserByID)
	mux.HandleFunc("/api/admin/sessions", s.handleAdminSessions)
	mux.HandleFunc("/api/admin/sessions/", s.handleAdminSessionByID)
	mux.HandleFunc("/api/admin/stats", s.handleAdminStats)
	mux.HandleFunc("/api/admin/messages", s.handleAdminMessages)
	mux.HandleFunc("/api/admin/payments", s.handleAdminPayments)
	mux.HandleFunc("/api/admin/payment-logs", s.handleAdminPaymentLogs)
	mux.HandleFunc("/api/admin/transactions", s.handleAdminTransactions)
	mux.HandleFunc("/api/admin/audit-logs", s.handleAdminAuditLogs)
	mux.HandleFunc("/api/admin/storage", s.handleAdminStorage)
	mux.HandleFunc("/api/admin/cleanup", s.handleAdminCleanup)
	mux.HandleFunc("/api/admin/frames", s.handleAdminFrames)
	mux.HandleFunc("/api/admin/frames/upload", s.handleAdminFrameUpload)
	mux.HandleFunc("/api/admin/frames/", s.handleAdminFrameByID)
	mux.HandleFunc("/api/admin/filters", s.handleAdminFilters)
	mux.HandleFunc("/api/admin/filters/", s.handleAdminFilterByID)
	mux.HandleFunc("/api/admin/vouchers", s.handleAdminVouchers)
	mux.HandleFunc("/api/admin/vouchers/bulk-delete", s.handleAdminBulkDeleteVouchers)
	mux.HandleFunc("/api/admin/vouchers/", s.handleAdminVoucherByID)

	mux.HandleFunc("/api/admin/projects", s.handleAdminProjects)
	mux.HandleFunc("/api/admin/projects/", s.handleAdminProjectByID)

	mux.HandleFunc("/api/admin/wallet", s.handleAdminWallet)
	mux.HandleFunc("/api/admin/wallet/settings", s.handleAdminWalletSettings)
	mux.HandleFunc("/api/admin/wallet/withdraw", s.handleAdminWalletWithdraw)

	mux.HandleFunc("/api/admin/subscriptions", s.handleAdminSubscriptions)
	mux.HandleFunc("/api/admin/subscriptions/", s.handleAdminSubscriptionByID)

	mux.HandleFunc("/api/admin/payment_keys", s.handleAdminPaymentKeys)

	mux.HandleFunc("/api/admin/frames_gif", s.handleAdminFramesGif)
	mux.HandleFunc("/api/admin/frames_gif/upload", s.handleAdminFrameGifUpload)
	mux.HandleFunc("/api/admin/frames_gif/", s.handleAdminFrameGifByID)

	mux.HandleFunc("/api/printers", s.handlePrinters)
	mux.HandleFunc("/api/prints", s.handlePrints)
	mux.HandleFunc("/api/prints/", s.handlePrintByID)

	mux.HandleFunc("/files/", s.handleFiles)

	return s.withCORS(mux)
}

func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.setSecurityHeaders(w)
		origin := r.Header.Get("origin")
		if s.allowedOrigin(origin) {
			w.Header().Set("access-control-allow-origin", origin)
			w.Header().Set("vary", "Origin")
		}
		w.Header().Set("access-control-allow-methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS")
		w.Header().Set("access-control-allow-headers", "content-type,x-admin-key,authorization,x-session-token")
		if strings.EqualFold(r.Header.Get("access-control-request-private-network"), "true") {
			w.Header().Set("access-control-allow-private-network", "true")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		if s.cfg.MaxBodyBytes > 0 {
			r.Body = http.MaxBytesReader(w, r.Body, s.cfg.MaxBodyBytes)
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) setSecurityHeaders(w http.ResponseWriter) {
	w.Header().Set("x-content-type-options", "nosniff")
	w.Header().Set("x-frame-options", "DENY")
	w.Header().Set("referrer-policy", "no-referrer")
	w.Header().Set("permissions-policy", "camera=(), microphone=(), geolocation=()")
	w.Header().Set("content-security-policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://unpkg.com; script-src 'self' 'unsafe-inline' https://unpkg.com")
}

func (s *Server) allowedOrigin(origin string) bool {
	if origin == "" {
		return true
	}
	if len(s.cfg.AllowedOrigins) == 0 {
		return strings.HasPrefix(origin, "http://localhost:") || strings.HasPrefix(origin, "http://127.0.0.1:")
	}
	for _, allowed := range s.cfg.AllowedOrigins {
		if origin == allowed {
			return true
		}
	}
	return false
}

func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	// The kiosk runs this API on the same computer that owns the DSLR. When a
	// frontend build is present, serve it from this process so the browser and
	// gphoto2 backend share one local origin (http://localhost:8787).
	if s.serveKioskFrontend(w, r) {
		return
	}
	if r.URL.Path != "/" {
		writeError(w, http.StatusNotFound, "Route not found.")
		return
	}

	writeJSON(w, http.StatusOK, response{Data: map[string]any{
		"service": "urbanmenphoto-go-backend",
		"status":  "ok",
		"docs":    "/swagger",
	}})
}

func (s *Server) handleSwaggerUI(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/swagger" {
		writeError(w, http.StatusNotFound, "Route not found.")
		return
	}
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	w.Header().Set("content-type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Urbanmenphoto API</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({ url: "/swagger/openapi.yaml", dom_id: "#swagger-ui" });
    </script>
  </body>
</html>`))
}

func (s *Server) handleSwaggerSpec(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	w.Header().Set("content-type", "application/yaml; charset=utf-8")
	http.ServeFile(w, r, resolveLocalFile(
		filepath.Join("backend", "docs", "openapi.yaml"),
		filepath.Join("docs", "openapi.yaml"),
		filepath.Join("..", "..", "docs", "openapi.yaml"),
	))
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	writeJSON(w, http.StatusOK, response{Data: map[string]any{
		"ok":      true,
		"service": "urbanmenphoto-go-backend",
	}})
}

func (s *Server) handleErrorEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	if !s.allowRequest(r, "error-events", 60) {
		writeError(w, http.StatusTooManyRequests, "Too many error events.")
		return
	}

	var body models.ErrorEventRequest
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	category := normalizeErrorCategory(body.Category)
	message := strings.TrimSpace(body.Message)
	if message == "" {
		message = "Unknown error"
	}
	if len(message) > 400 {
		message = message[:400]
	}
	source := strings.TrimSpace(body.Source)
	if source == "" {
		source = "client"
	}
	resource := strings.TrimSpace(body.SessionID)
	if resource == "" {
		resource = category
	}
	metadata := map[string]any{
		"category": category,
		"message":  message,
		"source":   source,
	}
	if body.Metadata != nil {
		metadata["detail"] = body.Metadata
	}

	s.auditWithMetadata(r, nil, "monitoring.error."+category, resource, false, metadata)
	writeJSON(w, http.StatusAccepted, response{Data: map[string]any{"recorded": true}})
}

func (s *Server) handleSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	var body models.CreateSessionRequest
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validateContact(body.Email, body.Phone); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	session, customerToken := s.newSession(body)
	if err := s.store.InsertSession(session); err != nil {
		s.recordMonitoringError(r, "save_photo", session.ID, "Failed to save session.", map[string]any{"error": err.Error()})
		writeError(w, http.StatusInternalServerError, "Failed to save session.")
		return
	}
	s.audit(r, nil, "customer.session.create", session.ID, true)

	writeJSON(w, http.StatusCreated, response{Data: sessionResponse(session, customerToken)})
}

func (s *Server) handleSessionByID(w http.ResponseWriter, r *http.Request) {
	sessionID, action := pathIDAndAction(r.URL.Path, "/api/sessions/")
	if sessionID == "" {
		writeError(w, http.StatusNotFound, "Session not found.")
		return
	}

	switch {
	case r.Method == http.MethodGet && action == "":
		session, ok := s.store.FindSession(sessionID)
		if !ok {
			writeError(w, http.StatusNotFound, "Session not found.")
			return
		}
		if err := requireCustomerSession(r, session); err != nil {
			writeError(w, http.StatusUnauthorized, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, response{Data: sessionResponse(session, "")})
	case r.Method == http.MethodPatch && action == "":
		s.patchSession(w, r, sessionID)
	case r.Method == http.MethodPost && action == "finalize":
		s.finalizeSession(w, r, sessionID)
	case r.Method == http.MethodPost && action == "send-link":
		s.recordSendLink(w, r, sessionID)
	case r.Method == http.MethodPost && action == "expire":
		s.expireSession(w, r, sessionID)
	default:
		writeError(w, http.StatusNotFound, "Route not found.")
	}
}

func (s *Server) handleGalleryByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	sessionID, _ := pathIDAndAction(r.URL.Path, "/api/galleries/")
	session, ok := s.store.FindSession(sessionID)
	if !ok {
		writeError(w, http.StatusNotFound, "Gallery not found.")
		return
	}

	expired := time.Now().After(session.ExpiresAt)
	if expired {
		writeError(w, http.StatusGone, "Gallery link has expired.")
		return
	}

	writeJSON(w, http.StatusOK, response{Data: models.Gallery{
		SessionID:     session.ID,
		Status:        session.Status,
		FinalImage:    session.FinalImage,
		AnimatedImage: session.AnimatedImage,
		Images:        session.Images,
		DownloadURL:   session.DownloadURL,
		ExpiresAt:     session.ExpiresAt,
		Expired:       expired,
	}})
}

func (s *Server) handleAdminSessions(w http.ResponseWriter, r *http.Request) {
	if _, err := s.requireAdmin(r); err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	items := sessionResponses(filterSessions(s.store.ListSessions(), r))
	writeJSON(w, http.StatusOK, response{Data: paginateSessions(r, items)})
}

func (s *Server) handleAdminSessionByID(w http.ResponseWriter, r *http.Request) {
	adminUser, err := s.requireAdmin(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	sessionID, _ := pathIDAndAction(r.URL.Path, "/api/admin/sessions/")
	switch r.Method {
	case http.MethodGet:
		session, ok := s.store.FindSession(sessionID)
		if !ok {
			writeError(w, http.StatusNotFound, "Session not found.")
			return
		}
		payments := s.store.PaymentsBySession(session.ID)
		auditResources := []string{session.ID}
		for _, payment := range payments {
			auditResources = append(auditResources, payment.ID)
		}
		writeJSON(w, http.StatusOK, response{Data: models.AdminSessionDetail{
			Session:   sessionResponse(session, ""),
			Messages:  s.store.MessagesBySession(session.ID),
			Payments:  payments,
			AuditLogs: auditLogsByResources(s.store.ListAuditLogs(), auditResources),
		}})
	case http.MethodDelete:
		if adminUser.Role != "owner" {
			writeError(w, http.StatusForbidden, "Owner admin role is required.")
			return
		}
		session, err := s.store.DeleteSession(sessionID)
		if err != nil {
			writeError(w, http.StatusNotFound, "Session not found.")
			return
		}
		_ = os.RemoveAll(filepath.Join(s.cfg.StorageDir, "sessions", session.ID))
		s.auditWithMetadata(r, &adminUser.ID, "admin.session.delete", session.ID, true, map[string]any{
			"deletedSession": map[string]any{
				"id":            session.ID,
				"status":        session.Status,
				"email":         session.Email,
				"phone":         session.Phone,
				"layoutId":      session.LayoutID,
				"paperSize":     session.PaperSize,
				"frameId":       session.FrameID,
				"imageCount":    len(session.Images),
				"downloadUrl":   session.DownloadURL,
				"createdAt":     session.CreatedAt,
				"finalImage":    session.FinalImage,
				"printImage":    session.PrintImage,
				"animatedImage": session.AnimatedImage,
			},
		})
		w.WriteHeader(http.StatusNoContent)
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
	}
}

func (s *Server) handleAdminStats(w http.ResponseWriter, r *http.Request) {
	if _, err := s.requireAdmin(r); err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	today := time.Now().Format("2006-01-02")
	stats := models.Stats{}

	for _, session := range s.store.ListSessions() {
		stats.TotalSessions++
		if session.Status == "finalized" {
			stats.FinalizedSessions++
		}
		if session.CreatedAt.Format("2006-01-02") == today {
			stats.SessionsToday++
		}
		stats.TotalImages += len(session.Images)
	}
	for _, payment := range s.store.ListPayments() {
		stats.TotalPayments++
		if payment.Status == "paid" || payment.Status == "success" {
			stats.PaidPayments++
			stats.Revenue += payment.Amount
		}
	}

	writeJSON(w, http.StatusOK, response{Data: stats})
}

func (s *Server) handleAdminLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	if !s.allowRequest(r, "admin-login", 5) {
		writeError(w, http.StatusTooManyRequests, "Too many login attempts. Please wait before trying again.")
		return
	}

	var body models.AdminLoginRequest
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	email := strings.ToLower(strings.TrimSpace(body.Email))
	if !validEmail(email) {
		writeError(w, http.StatusBadRequest, "email is invalid.")
		return
	}
	if attempt, ok := s.store.FindLoginAttempt(email); ok && attempt.LockedUntil != nil && time.Now().Before(*attempt.LockedUntil) {
		s.audit(r, nil, "admin.login.locked", "admin", false)
		writeError(w, http.StatusTooManyRequests, "Too many failed login attempts. Try again later.")
		return
	}

	user, ok := s.store.FindAdminUserByEmail(email)
	if !ok || !auth.VerifyPassword(body.Password, user.PasswordHash) {
		s.recordFailedLogin(email)
		s.audit(r, nil, "admin.login.failed", "admin", false)
		writeError(w, http.StatusUnauthorized, "Email or password is invalid.")
		return
	}
	s.clearLoginAttempt(email)

	if user.TwoFactorEnabled {
		otp := fmt.Sprintf("%06d", mathrand.Intn(1000000))
		if err := s.store.UpsertLoginOTP(models.LoginOTP{
			Email:     user.Email,
			OTP:       otp,
			ExpiresAt: time.Now().Add(5 * time.Minute),
			CreatedAt: time.Now(),
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to generate OTP.")
			return
		}

		if s.isSMTPConfigured() {
			subject := "Kode Verifikasi Login Admin"
			message := fmt.Sprintf("Kode OTP Anda adalah: %s\nBerlaku selama 5 menit.", otp)
			go s.sendEmail(user.Email, subject, message)
		} else {
			// Fallback: If no SMTP, just log it to stdout for debugging (or they would be locked out)
			fmt.Printf("[2FA OTP] Email: %s, OTP: %s\n", user.Email, otp)
		}

		s.audit(r, &user.ID, "admin.login.2fa_sent", "admin", true)
		writeJSON(w, http.StatusOK, response{Data: models.AdminLoginResponse{
			Authenticated: false,
			Requires2FA:   true,
		}})
		return
	}

	token := newID() + "." + shortCode()
	now := time.Now()
	expiresAt := now.Add(time.Duration(s.cfg.AdminTokenTTLHrs) * time.Hour)
	if err := s.store.InsertAdminToken(models.AdminToken{
		TokenHash: auth.HashToken(token),
		UserID:    user.ID,
		ExpiresAt: expiresAt,
		CreatedAt: now,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to create admin token.")
		return
	}
	s.audit(r, &user.ID, "admin.login.success", "admin", true)

	writeJSON(w, http.StatusOK, response{Data: models.AdminLoginResponse{
		Authenticated: true,
		Token:         token,
		ExpiresAt:     expiresAt.Format(time.RFC3339),
		Role:          user.Role,
	}})
}

func (s *Server) handleAdminVerifyOTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	if !s.allowRequest(r, "admin-login-otp", 5) {
		writeError(w, http.StatusTooManyRequests, "Too many verification attempts.")
		return
	}

	var body models.AdminVerifyOTPRequest
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	
	if !s.store.VerifyLoginOTP(email, body.OTP) {
		s.recordFailedLogin(email)
		s.audit(r, nil, "admin.login.2fa_failed", "admin", false)
		writeError(w, http.StatusUnauthorized, "Kode OTP salah atau sudah kadaluarsa.")
		return
	}
	
	s.store.DeleteLoginOTP(email)
	s.clearLoginAttempt(email)

	user, ok := s.store.FindAdminUserByEmail(email)
	if !ok {
		writeError(w, http.StatusUnauthorized, "User not found.")
		return
	}

	token := newID() + "." + shortCode()
	now := time.Now()
	expiresAt := now.Add(time.Duration(s.cfg.AdminTokenTTLHrs) * time.Hour)
	if err := s.store.InsertAdminToken(models.AdminToken{
		TokenHash: auth.HashToken(token),
		UserID:    user.ID,
		ExpiresAt: expiresAt,
		CreatedAt: now,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to create admin token.")
		return
	}
	s.audit(r, &user.ID, "admin.login.success", "admin", true)

	writeJSON(w, http.StatusOK, response{Data: models.AdminLoginResponse{
		Authenticated: true,
		Token:         token,
		ExpiresAt:     expiresAt.Format(time.RFC3339),
		Role:          user.Role,
	}})
}

func (s *Server) handleAdminToggle2FA(w http.ResponseWriter, r *http.Request) {
	adminUser, err := s.requireAdmin(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := s.store.ToggleTwoFactor(adminUser.ID, body.Enabled); err != nil {
		writeError(w, http.StatusInternalServerError, "Gagal mengubah status 2FA.")
		return
	}
	
	action := "admin.2fa.disabled"
	if body.Enabled {
		action = "admin.2fa.enabled"
	}
	s.audit(r, &adminUser.ID, action, "admin_users:"+adminUser.ID, true)

	writeJSON(w, http.StatusOK, response{Data: map[string]any{"success": true}})
}

func (s *Server) handleAdminMe(w http.ResponseWriter, r *http.Request) {
	adminUser, err := s.requireAdmin(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	writeJSON(w, http.StatusOK, response{Data: map[string]any{
		"authenticated": true,
		"email":         adminUser.Email,
		"role":          adminUser.Role,
	}})
}

func (s *Server) handleAdminLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	tokenHash, err := adminTokenHashFromRequest(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	token, ok := s.store.FindAdminTokenByHash(tokenHash)
	if !ok || time.Now().After(token.ExpiresAt) {
		writeError(w, http.StatusUnauthorized, "Admin bearer token is invalid or expired.")
		return
	}

	var actorID *string
	if user, ok := s.store.FindAdminUserByID(token.UserID); ok {
		actorID = &user.ID
	}
	if err := s.store.DeleteAdminToken(tokenHash); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to logout admin.")
		return
	}
	s.audit(r, actorID, "admin.logout", "admin", true)

	writeJSON(w, http.StatusOK, response{Data: map[string]any{
		"authenticated": false,
		"loggedOut":     true,
	}})
}

func (s *Server) handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	adminUser, err := s.requireOwner(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, response{Data: adminUserViews(s.store.ListAdminUsers())})
	case http.MethodPost:
		s.createAdminUser(w, r, &adminUser.ID)
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
	}
}

func (s *Server) handleAdminUserByID(w http.ResponseWriter, r *http.Request) {
	adminUser, err := s.requireOwner(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	userID, _ := pathIDAndAction(r.URL.Path, "/api/admin/users/")
	if userID == "" {
		writeError(w, http.StatusNotFound, "Admin user not found.")
		return
	}

	switch r.Method {
	case http.MethodPatch:
		s.updateAdminUser(w, r, userID, &adminUser.ID)
	case http.MethodDelete:
		if userID == adminUser.ID {
			writeError(w, http.StatusBadRequest, "You cannot delete your own admin account.")
			return
		}
		deletedUser, _ := s.store.FindAdminUserByID(userID)
		if err := s.store.DeleteAdminUser(userID); err != nil {
			writeError(w, http.StatusNotFound, "Admin user not found.")
			return
		}
		s.auditWithMetadata(r, &adminUser.ID, "admin.user.delete", userID, true, map[string]any{
			"deletedUser": map[string]any{
				"id":    deletedUser.ID,
				"email": deletedUser.Email,
				"role":  deletedUser.Role,
			},
		})
		w.WriteHeader(http.StatusNoContent)
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
	}
}

func (s *Server) handleAdminMessages(w http.ResponseWriter, r *http.Request) {
	if _, err := s.requireAdmin(r); err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	writeJSON(w, http.StatusOK, response{Data: paginateMessages(r, filterMessages(s.store.ListMessages(), r))})
}

func (s *Server) handleAdminPayments(w http.ResponseWriter, r *http.Request) {
	if _, err := s.requireAdmin(r); err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	writeJSON(w, http.StatusOK, response{Data: paginatePayments(r, filterPayments(s.store.ListPayments(), r))})
}

func (s *Server) handleAdminPaymentLogs(w http.ResponseWriter, r *http.Request) {
	if _, err := s.requireAdmin(r); err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	paymentID := strings.TrimSpace(r.URL.Query().Get("paymentId"))
	if paymentID != "" {
		writeJSON(w, http.StatusOK, response{Data: s.store.PaymentLogsByPayment(paymentID)})
		return
	}
	writeJSON(w, http.StatusOK, response{Data: s.store.ListPaymentLogs()})
}

func (s *Server) handleAdminTransactions(w http.ResponseWriter, r *http.Request) {
	if _, err := s.requireAdmin(r); err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	transactions := []models.Transaction{}
	for _, payment := range s.store.ListPayments() {
		transactions = append(transactions, models.Transaction{
			ID:        payment.ID,
			SessionID: payment.SessionID,
			Provider:  payment.Provider,
			Amount:    payment.Amount,
			Currency:  payment.Currency,
			Status:    payment.Status,
			CreatedAt: payment.CreatedAt,
		})
	}
	writeJSON(w, http.StatusOK, response{Data: transactions})
}

func (s *Server) handleAdminAuditLogs(w http.ResponseWriter, r *http.Request) {
	adminUser, err := s.requireAdmin(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	items := filterAuditLogs(s.store.ListAuditLogs(), r)
	if adminUser.Role != "owner" {
		monitoringOnly := []models.AuditLog{}
		for _, item := range items {
			if strings.HasPrefix(item.Action, "monitoring.error.") {
				monitoringOnly = append(monitoringOnly, item)
			}
		}
		items = monitoringOnly
	}
	writeJSON(w, http.StatusOK, response{Data: paginateAuditLogs(r, items)})
}

func (s *Server) handleAdminStorage(w http.ResponseWriter, r *http.Request) {
	if _, err := s.requireOwner(r); err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	writeJSON(w, http.StatusOK, response{Data: s.StorageStats()})
}

func (s *Server) handleAdminCleanup(w http.ResponseWriter, r *http.Request) {
	adminUser, err := s.requireOwner(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	result := s.CleanupExpiredSessions()
	s.auditWithMetadata(r, &adminUser.ID, "admin.cleanup", "sessions", true, map[string]any{
		"cleanup": map[string]any{
			"deletedSessions": result.DeletedSessions,
			"deletedFiles":    result.DeletedFiles,
		},
	})

	writeJSON(w, http.StatusOK, response{Data: result})
}

func (s *Server) StorageStats() models.StorageStats {
	stats := models.StorageStats{
		StorageDir: s.cfg.StorageDir,
	}
	now := time.Now()
	for _, session := range s.store.ListSessions() {
		stats.TotalSessions++
		switch strings.ToLower(session.Status) {
		case "finalized":
			stats.FinalizedSessions++
		case "paid", "success":
			stats.PaidSessions++
		}
		if !now.Before(session.ExpiresAt) {
			stats.ExpiredSessions++
		}
	}
	stats.StorageFiles, stats.StorageBytes = countFilesAndBytes(s.cfg.StorageDir)
	return stats
}

func (s *Server) CleanupExpiredSessions() models.CleanupResult {
	result := models.CleanupResult{}
	now := time.Now()
	for _, session := range s.store.ListSessions() {
		if now.Before(session.ExpiresAt) {
			continue
		}
		deletedFiles := countFiles(filepath.Join(s.cfg.StorageDir, "sessions", session.ID))
		if _, err := s.store.DeleteSession(session.ID); err == nil {
			result.DeletedSessions++
			result.DeletedFiles += deletedFiles
			_ = os.RemoveAll(filepath.Join(s.cfg.StorageDir, "sessions", session.ID))
		}
	}
	return result
}

func (s *Server) StartCleanupWorker() {
	if s.cfg.CleanupIntervalMins <= 0 {
		return
	}
	interval := time.Duration(s.cfg.CleanupIntervalMins) * time.Minute
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			result := s.CleanupExpiredSessions()
			if result.DeletedSessions > 0 || result.DeletedFiles > 0 {
				log.Printf("cleanup expired sessions: deleted_sessions=%d deleted_files=%d", result.DeletedSessions, result.DeletedFiles)
			}
		}
	}()
}

func (s *Server) handlePayments(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	if !s.allowRequest(r, "create-payment", 20) {
		writeError(w, http.StatusTooManyRequests, "Too many payment requests. Please wait before trying again.")
		return
	}

	var body models.CreatePaymentRequest
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.SessionID == "" {
		writeError(w, http.StatusBadRequest, "sessionId is required.")
		return
	}
	if body.Amount <= 0 {
		writeError(w, http.StatusBadRequest, "amount must be greater than zero.")
		return
	}
	if body.Amount > 100000000 {
		writeError(w, http.StatusBadRequest, "amount is too large.")
		return
	}
	session, ok := s.store.FindSession(body.SessionID)
	if !ok {
		writeError(w, http.StatusNotFound, "Session not found.")
		return
	}
	if err := requireCustomerSession(r, session); err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	now := time.Now()
	
	// Process Voucher if provided
	var voucherID *string
	var appliedVoucher *models.Voucher
	var discountAmount int64 = 0
	originalAmount := body.Amount
	finalAmount := originalAmount

	if body.VoucherCode != "" {
		code := normalizeVoucherCode(body.VoucherCode)
		for _, v := range s.store.ListVouchers() {
			if strings.EqualFold(v.Code, code) {
				appliedVoucher = &v
				break
			}
		}

		if appliedVoucher == nil || !appliedVoucher.Active {
			writeError(w, http.StatusBadRequest, "Invalid or inactive voucher code.")
			return
		}
		if appliedVoucher.StartsAt != nil && now.Before(*appliedVoucher.StartsAt) {
			writeError(w, http.StatusBadRequest, "Voucher is not yet active.")
			return
		}
		if appliedVoucher.EndsAt != nil && now.After(*appliedVoucher.EndsAt) {
			writeError(w, http.StatusBadRequest, "Voucher has expired.")
			return
		}
		if appliedVoucher.UsageLimit > 0 && appliedVoucher.UsedCount >= appliedVoucher.UsageLimit {
			writeError(w, http.StatusBadRequest, "Voucher usage limit reached.")
			return
		}
		if appliedVoucher.MinAmount > 0 && originalAmount < appliedVoucher.MinAmount {
			writeError(w, http.StatusBadRequest, "Minimum amount for this voucher not met.")
			return
		}

		if appliedVoucher.Type == "fixed" {
			discountAmount = appliedVoucher.Value
		} else if appliedVoucher.Type == "percent" {
			discountAmount = (originalAmount * appliedVoucher.Value) / 100
		}

		if appliedVoucher.MaxDiscount > 0 && discountAmount > appliedVoucher.MaxDiscount {
			discountAmount = appliedVoucher.MaxDiscount
		}

		if discountAmount > originalAmount {
			discountAmount = originalAmount
		}
		
		finalAmount = originalAmount - discountAmount
		voucherID = &appliedVoucher.ID
	}
	provider := body.Provider
	if provider == "" {
		provider = "midtrans"
	}
	if !validSlug(provider, 32) {
		writeError(w, http.StatusBadRequest, "provider is invalid.")
		return
	}
	currency := body.Currency
	if currency == "" {
		currency = "IDR"
	}
	if currency != "IDR" {
		writeError(w, http.StatusBadRequest, "currency must be IDR.")
		return
	}

	payment := models.Payment{
		ID:             newID(),
		SessionID:      body.SessionID,
		Provider:       provider,
		Amount:         finalAmount,
		Currency:       currency,
		Status:         "pending",
		VoucherID:      voucherID,
		OriginalAmount: originalAmount,
		DiscountAmount: discountAmount,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if finalAmount <= 0 {
		finalAmount = 0
		payment.Amount = finalAmount
		payment.Status = "paid"
		provider = "free"
		payment.Provider = provider
	} else if provider == "qris-simulation" {
		payment.Status = "paid"
	}
	
	if provider == "midtrans" {
		snapToken, checkoutURL, err := s.createMidtransSnap(r, payment, session)
		if err != nil {
			s.recordMonitoringError(r, "payment", payment.ID, "Failed to create Midtrans transaction.", map[string]any{
				"error":     err.Error(),
				"sessionId": payment.SessionID,
				"amount":    payment.Amount,
			})
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		payment.ProviderRef = &payment.ID
		payment.SnapToken = &snapToken
		payment.CheckoutURL = &checkoutURL
	}
	if provider == "midtrans-qris" {
		qrString, qrImageData, qrURL, err := s.createMidtransQRIS(payment, session)
		if err != nil {
			s.recordMonitoringError(r, "payment", payment.ID, "Failed to create Midtrans QRIS transaction.", map[string]any{
				"error":     err.Error(),
				"sessionId": payment.SessionID,
				"amount":    payment.Amount,
			})
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		payment.ProviderRef = &payment.ID
		payment.CheckoutURL = &qrURL
		if qrString != "" {
			payment.QRString = &qrString
		}
		if qrImageData != "" {
			payment.QRImageData = &qrImageData
		}
	}
	if err := s.store.InsertPayment(payment); err != nil {
		s.recordMonitoringError(r, "payment", payment.ID, "Failed to save payment.", map[string]any{
			"error":     err.Error(),
			"sessionId": payment.SessionID,
			"provider":  payment.Provider,
			"amount":    payment.Amount,
		})
		writeError(w, http.StatusInternalServerError, "Failed to save payment.")
		return
	}
	
	// Increment used count
	if appliedVoucher != nil {
		appliedVoucher.UsedCount++
		_ = s.store.UpsertVoucher(*appliedVoucher)
	}

	if err := s.insertPaymentLog(r, "payment.created", payment, nil, map[string]any{
		"sessionId": payment.SessionID,
		"provider":  payment.Provider,
		"amount":    payment.Amount,
		"currency":  payment.Currency,
	}); err != nil {
		s.recordMonitoringError(r, "payment", payment.ID, "Failed to save payment log.", map[string]any{
			"error":     err.Error(),
			"sessionId": payment.SessionID,
			"provider":  payment.Provider,
			"amount":    payment.Amount,
		})
		writeError(w, http.StatusInternalServerError, "Failed to save payment log.")
		return
	}
	if payment.Status == "paid" {
		if session, ok := s.store.FindSession(payment.SessionID); ok {
			session.Status = "paid"
			session.UpdatedAt = now
			_ = s.store.UpdateSession(session)
		}
	}
	s.auditWithMetadata(r, nil, "customer.payment.create", payment.ID, true, map[string]any{
		"payment": map[string]any{
			"id":        payment.ID,
			"sessionId": payment.SessionID,
			"provider":  payment.Provider,
			"amount":    payment.Amount,
			"currency":  payment.Currency,
			"status":    payment.Status,
		},
	})

	writeJSON(w, http.StatusCreated, response{Data: payment})
}

func (s *Server) handlePaymentByID(w http.ResponseWriter, r *http.Request) {
	paymentID, action := pathIDAndAction(r.URL.Path, "/api/payments/")

	switch {
	case r.Method == http.MethodGet && action == "":
		payment, ok := s.store.FindPayment(paymentID)
		if !ok {
			writeError(w, http.StatusNotFound, "Payment not found.")
			return
		}
		writeJSON(w, http.StatusOK, response{Data: payment})
	case r.Method == http.MethodPost && action == "confirm":
		s.confirmPayment(w, r, paymentID)
	case r.Method == http.MethodPost && action == "webhook":
		s.handlePaymentWebhook(w, r, paymentID)
	default:
		writeError(w, http.StatusNotFound, "Route not found.")
	}
}

func (s *Server) handleFrames(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	frames := []models.Frame{}
	for _, frame := range s.store.ListFrames() {
		if frame.Active {
			frames = append(frames, frame)
		}
	}
	writeJSON(w, http.StatusOK, response{Data: frames})
}

func (s *Server) handleAdminFrames(w http.ResponseWriter, r *http.Request) {
	adminUser, err := s.requireAdmin(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, response{Data: s.store.ListFrames()})
	case http.MethodPost:
		if adminUser.Role != "owner" {
			writeError(w, http.StatusForbidden, "Owner admin role is required.")
			return
		}
		s.upsertFrame(w, r, "", &adminUser.ID)
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
	}
}

func (s *Server) handleAdminFrameByID(w http.ResponseWriter, r *http.Request) {
	adminUser, err := s.requireOwner(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	frameID, _ := pathIDAndAction(r.URL.Path, "/api/admin/frames/")
	switch r.Method {
	case http.MethodPut:
		s.upsertFrame(w, r, frameID, &adminUser.ID)
	case http.MethodDelete:
		var deletedFrame models.Frame
		for _, frame := range s.store.ListFrames() {
			if frame.ID == frameID {
				deletedFrame = frame
				break
			}
		}
		if err := s.store.DeleteFrame(frameID); err != nil {
			writeError(w, http.StatusNotFound, "Frame not found.")
			return
		}
		s.auditWithMetadata(r, &adminUser.ID, "admin.frame.delete", frameID, true, map[string]any{
			"deletedFrame": map[string]any{
				"id":           deletedFrame.ID,
				"name":         deletedFrame.Name,
				"category":     deletedFrame.Category,
				"layoutCount":  deletedFrame.LayoutCount,
				"templateType": deletedFrame.TemplateType,
				"paperSize":    deletedFrame.PaperSize,
				"active":       deletedFrame.Active,
			},
		})
		w.WriteHeader(http.StatusNoContent)
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
	}
}

func (s *Server) handleAdminVouchers(w http.ResponseWriter, r *http.Request) {
	adminUser, err := s.requireOwner(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, response{Data: s.store.ListVouchers()})
	case http.MethodPost:
		s.upsertVoucher(w, r, "", &adminUser.ID)
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
	}
}

func (s *Server) handleAdminVoucherByID(w http.ResponseWriter, r *http.Request) {
	adminUser, err := s.requireOwner(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	voucherID, _ := pathIDAndAction(r.URL.Path, "/api/admin/vouchers/")
	if voucherID == "" {
		writeError(w, http.StatusNotFound, "Voucher not found.")
		return
	}

	switch r.Method {
	case http.MethodPut:
		s.upsertVoucher(w, r, voucherID, &adminUser.ID)
	case http.MethodDelete:
		var deletedVoucher models.Voucher
		for _, voucher := range s.store.ListVouchers() {
			if voucher.ID == voucherID {
				deletedVoucher = voucher
				break
			}
		}
		if err := s.store.DeleteVoucher(voucherID); err != nil {
			writeError(w, http.StatusNotFound, "Voucher not found.")
			return
		}
		s.auditWithMetadata(r, &adminUser.ID, "admin.voucher.delete", voucherID, true, map[string]any{
			"deletedVoucher": voucherAuditPayload(deletedVoucher),
		})
		w.WriteHeader(http.StatusNoContent)
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
	}
}

func (s *Server) handleFiles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	relativePath := strings.TrimPrefix(r.URL.Path, "/files/")
	relativePath = filepath.ToSlash(filepath.Clean(relativePath))
	if relativePath == "." || strings.HasPrefix(relativePath, "../") || strings.HasPrefix(relativePath, "/") || strings.Contains(relativePath, "/../") {
		writeError(w, http.StatusBadRequest, "Invalid file path.")
		return
	}

	parts := strings.Split(relativePath, "/")
	if parts[0] == "sessions" && len(parts) < 3 {
		writeError(w, http.StatusNotFound, "File not found.")
		return
	}
	if len(parts) >= 3 && parts[0] == "sessions" {
		session, ok := s.store.FindSession(parts[1])
		if !ok {
			writeError(w, http.StatusNotFound, "File not found.")
			return
		}
		if !time.Now().Before(session.ExpiresAt) {
			writeError(w, http.StatusGone, "Gallery file has expired.")
			return
		}
	}

	http.ServeFile(w, r, filepath.Join(s.cfg.StorageDir, relativePath))
}

func (s *Server) finalizeSession(w http.ResponseWriter, r *http.Request, sessionID string) {
	var body models.FinalizeSessionRequest
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validateContact(body.Email, body.Phone); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(body.Images) > maxSessionImages {
		writeError(w, http.StatusBadRequest, "too many images.")
		return
	}

	session, ok := s.store.FindSession(sessionID)
	if !ok {
		writeError(w, http.StatusNotFound, "Session not found.")
		return
	}
	if err := requireCustomerSession(r, session); err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	beforeSession := session

	imageURLs := make([]string, 0, len(body.Images)+1)
	if body.FinalImage != "" {
		image, err := s.saveDataURL(session.ID, body.FinalImage, "final-digital")
		if err != nil {
			log.Printf("skip invalid final image for session %s: %v", session.ID, err)
		} else {
			session.FinalImage = &image
			imageURLs = append(imageURLs, image.URL)
		}
	}
	if body.PrintImage != "" {
		image, err := s.saveDataURL(session.ID, body.PrintImage, "final-print")
		if err != nil {
			log.Printf("skip invalid print image for session %s: %v", session.ID, err)
		} else {
			session.PrintImage = &image
			imageURLs = append(imageURLs, image.URL)
		}
	} else if session.FinalImage != nil {
		session.PrintImage = session.FinalImage
	}
	if body.AnimatedImage != "" {
		image, err := s.saveAnimatedDataURL(session.ID, body.AnimatedImage, "featured-video")
		if err != nil {
			log.Printf("skip invalid animated image for session %s: %v", session.ID, err)
		} else {
			session.AnimatedImage = &image
			imageURLs = append(imageURLs, image.URL)
		}
	}

	for index, rawImage := range body.Images {
		image, err := s.saveDataURL(session.ID, rawImage, "image-"+itoa(index+1))
		if err != nil {
			log.Printf("skip invalid gallery image for session %s index %d: %v", session.ID, index, err)
			continue
		}
		imageURLs = append(imageURLs, image.URL)
	}

	if len(imageURLs) > 0 {
		session.Images = imageURLs
	} else {
		s.recordMonitoringError(r, "save_photo", session.ID, "No valid images were provided.", map[string]any{
			"finalImageProvided":    body.FinalImage != "",
			"printImageProvided":    body.PrintImage != "",
			"animatedImageProvided": body.AnimatedImage != "",
			"imageCount":            len(body.Images),
		})
		writeError(w, http.StatusBadRequest, "no valid images were provided.")
		return
	}

	session.Email = firstString(body.Email, session.Email)
	session.Phone = firstString(body.Phone, session.Phone)
	session.LayoutID = firstString(body.LayoutID, session.LayoutID)
	session.PaperSize = firstString(body.PaperSize, session.PaperSize)
	session.FrameID = firstString(body.FrameID, session.FrameID)
	session.Status = "finalized"
	session.UpdatedAt = time.Now()

	if err := s.store.UpdateSession(session); err != nil {
		s.recordMonitoringError(r, "save_photo", session.ID, "Failed to update finalized session.", map[string]any{"error": err.Error()})
		writeError(w, http.StatusInternalServerError, "Failed to update session.")
		return
	}
	s.auditWithMetadata(r, nil, "customer.session.finalize", session.ID, true, map[string]any{
		"before": map[string]any{
			"status":    beforeSession.Status,
			"email":     beforeSession.Email,
			"phone":     beforeSession.Phone,
			"layoutId":  beforeSession.LayoutID,
			"paperSize": beforeSession.PaperSize,
			"frameId":   beforeSession.FrameID,
		},
		"after": map[string]any{
			"status":        session.Status,
			"email":         session.Email,
			"phone":         session.Phone,
			"layoutId":      session.LayoutID,
			"paperSize":     session.PaperSize,
			"frameId":       session.FrameID,
			"imageCount":    len(session.Images),
			"hasFinalImage": session.FinalImage != nil,
			"hasPrintImage": session.PrintImage != nil,
			"hasAnimated":   session.AnimatedImage != nil,
			"downloadUrl":   session.DownloadURL,
		},
	})

	writeJSON(w, http.StatusOK, response{Data: sessionResponse(session, "")})
}

func (s *Server) patchSession(w http.ResponseWriter, r *http.Request, sessionID string) {
	var body models.PatchSessionRequest
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validateContact(body.Email, body.Phone); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	session, ok := s.store.FindSession(sessionID)
	if !ok {
		writeError(w, http.StatusNotFound, "Session not found.")
		return
	}
	if err := requireCustomerSession(r, session); err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	beforeSession := session

	session.Email = firstString(body.Email, session.Email)
	session.Phone = firstString(body.Phone, session.Phone)
	session.LayoutID = firstString(body.LayoutID, session.LayoutID)
	session.PaperSize = firstString(body.PaperSize, session.PaperSize)
	session.FrameID = firstString(body.FrameID, session.FrameID)
	if body.Status != nil && *body.Status != "" {
		session.Status = *body.Status
	}
	session.UpdatedAt = time.Now()

	if err := s.store.UpdateSession(session); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update session.")
		return
	}
	s.auditWithMetadata(r, nil, "customer.session.update", session.ID, true, map[string]any{
		"before": map[string]any{
			"status":    beforeSession.Status,
			"email":     beforeSession.Email,
			"phone":     beforeSession.Phone,
			"layoutId":  beforeSession.LayoutID,
			"paperSize": beforeSession.PaperSize,
			"frameId":   beforeSession.FrameID,
		},
		"after": map[string]any{
			"status":    session.Status,
			"email":     session.Email,
			"phone":     session.Phone,
			"layoutId":  session.LayoutID,
			"paperSize": session.PaperSize,
			"frameId":   session.FrameID,
		},
	})

	writeJSON(w, http.StatusOK, response{Data: sessionResponse(session, "")})
}

func (s *Server) expireSession(w http.ResponseWriter, r *http.Request, sessionID string) {
	session, ok := s.store.FindSession(sessionID)
	if !ok {
		writeError(w, http.StatusNotFound, "Session not found.")
		return
	}
	if err := requireCustomerSession(r, session); err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	beforeStatus := session.Status
	beforeExpiresAt := session.ExpiresAt
	now := time.Now()
	session.Status = "expired"
	session.ExpiresAt = now
	session.UpdatedAt = now

	if err := s.store.UpdateSession(session); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to expire session.")
		return
	}
	s.auditWithMetadata(r, nil, "customer.session.expire", session.ID, true, map[string]any{
		"before": map[string]any{
			"status":    beforeStatus,
			"expiresAt": beforeExpiresAt,
		},
		"after": map[string]any{
			"status":    session.Status,
			"expiresAt": session.ExpiresAt,
		},
	})

	writeJSON(w, http.StatusOK, response{Data: sessionResponse(session, "")})
}

func (s *Server) recordSendLink(w http.ResponseWriter, r *http.Request, sessionID string) {
	if !s.allowRequest(r, "send-link", 10) {
		writeError(w, http.StatusTooManyRequests, "Too many send-link requests. Please wait before trying again.")
		return
	}

	var body models.SendLinkRequest
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	session, ok := s.store.FindSession(sessionID)
	if !ok {
		writeError(w, http.StatusNotFound, "Session not found.")
		return
	}
	if err := requireCustomerSession(r, session); err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	recipient := body.Recipient
	if recipient == nil {
		recipient = firstString(body.Email, body.Phone)
	}

	channel := body.Channel
	if channel == "" {
		channel = "email"
	}
	if channel != "email" && channel != "whatsapp" {
		writeError(w, http.StatusBadRequest, "channel must be email or whatsapp.")
		return
	}
	if recipient == nil || *recipient == "" {
		writeError(w, http.StatusBadRequest, "recipient is required.")
		return
	}
	if channel == "email" && !validEmail(*recipient) {
		writeError(w, http.StatusBadRequest, "recipient email is invalid.")
		return
	}
	if channel == "whatsapp" && !validPhone(*recipient) {
		writeError(w, http.StatusBadRequest, "recipient phone is invalid.")
		return
	}

	downloadURL := session.DownloadURL
	if body.DownloadURL != nil && strings.TrimSpace(*body.DownloadURL) != "" {
		candidate := strings.TrimSpace(*body.DownloadURL)
		if !strings.HasPrefix(candidate, "http://") && !strings.HasPrefix(candidate, "https://") {
			writeError(w, http.StatusBadRequest, "downloadUrl must be a valid URL.")
			return
		}
		downloadURL = candidate
	}

	message := models.Message{
		ID:          newID(),
		SessionID:   session.ID,
		Channel:     channel,
		Recipient:   recipient,
		DownloadURL: downloadURL,
		Status:      "queued",
		CreatedAt:   time.Now(),
	}

	if channel == "email" && s.isSMTPConfigured() {
		if err := s.sendGalleryEmail(*recipient, downloadURL); err != nil {
			message.Status = "failed"
			_ = s.store.InsertMessage(message)
			s.recordMonitoringError(r, "email", session.ID, "Failed to send gallery email.", map[string]any{
				"error":       err.Error(),
				"recipient":   recipient,
				"downloadUrl": downloadURL,
			})
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		message.Status = "sent"
	}

	if err := s.store.InsertMessage(message); err != nil {
		s.recordMonitoringError(r, "whatsapp", session.ID, "Failed to record message.", map[string]any{
			"error":     err.Error(),
			"channel":   channel,
			"recipient": recipient,
		})
		writeError(w, http.StatusInternalServerError, "Failed to record message.")
		return
	}
	s.auditWithMetadata(r, nil, "customer.session.send_link", session.ID, true, map[string]any{
		"message": map[string]any{
			"id":          message.ID,
			"channel":     message.Channel,
			"recipient":   message.Recipient,
			"downloadUrl": message.DownloadURL,
			"status":      message.Status,
		},
	})

	writeJSON(w, http.StatusAccepted, response{Data: message})
}

func (s *Server) isSMTPConfigured() bool {
	return strings.TrimSpace(s.cfg.SMTPHost) != "" &&
		strings.TrimSpace(s.cfg.SMTPUsername) != "" &&
		strings.TrimSpace(s.cfg.SMTPPassword) != ""
}

func (s *Server) sendGalleryEmail(recipient string, downloadURL string) error {
	from := strings.TrimSpace(s.cfg.MailFrom)
	if from == "" {
		from = strings.TrimSpace(s.cfg.SMTPUsername)
	}
	envelopeFrom := from
	if parsedFrom, err := mail.ParseAddress(from); err == nil {
		envelopeFrom = parsedFrom.Address
	}
	subject := "Link hasil foto Urbanmenphoto"
	body := "Halo!\n\nIni link hasil foto Urbanmenphoto kamu:\n" + downloadURL + "\n\nLink aktif selama 7 hari.\n\nTerima kasih sudah foto bersama Urbanmenphoto."
	message := strings.Join([]string{
		"From: " + from,
		"To: " + recipient,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n")

	host := strings.TrimSpace(s.cfg.SMTPHost)
	port := strings.TrimSpace(s.cfg.SMTPPort)
	if port == "" {
		port = "587"
	}
	auth := smtp.PlainAuth("", strings.TrimSpace(s.cfg.SMTPUsername), strings.TrimSpace(s.cfg.SMTPPassword), host)
	return smtp.SendMail(host+":"+port, auth, envelopeFrom, []string{recipient}, []byte(message))
}

func (s *Server) sendEmail(recipient string, subject string, text string) error {
	from := strings.TrimSpace(s.cfg.MailFrom)
	if from == "" {
		from = strings.TrimSpace(s.cfg.SMTPUsername)
	}
	envelopeFrom := from
	if parsedFrom, err := mail.ParseAddress(from); err == nil {
		envelopeFrom = parsedFrom.Address
	}
	message := strings.Join([]string{
		"From: " + from,
		"To: " + recipient,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		text,
	}, "\r\n")

	host := strings.TrimSpace(s.cfg.SMTPHost)
	port := strings.TrimSpace(s.cfg.SMTPPort)
	if port == "" {
		port = "587"
	}
	auth := smtp.PlainAuth("", strings.TrimSpace(s.cfg.SMTPUsername), strings.TrimSpace(s.cfg.SMTPPassword), host)
	return smtp.SendMail(host+":"+port, auth, envelopeFrom, []string{recipient}, []byte(message))
}

func (s *Server) confirmPayment(w http.ResponseWriter, r *http.Request, paymentID string) {
	if !s.allowRequest(r, "payment-confirm", 30) {
		writeError(w, http.StatusTooManyRequests, "Too many payment confirmation requests. Please wait before trying again.")
		return
	}

	var body models.PaymentWebhookRequest
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	payment, ok := s.store.FindPayment(paymentID)
	if !ok {
		writeError(w, http.StatusNotFound, "Payment not found.")
		return
	}
	session, ok := s.store.FindSession(payment.SessionID)
	if !ok {
		writeError(w, http.StatusNotFound, "Session not found.")
		return
	}
	if err := requireCustomerSession(r, session); err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	if body.OrderID != "" && body.OrderID != payment.ID {
		writeError(w, http.StatusBadRequest, "order_id does not match payment.")
		return
	}

	status := body.Status
	if status == "" {
		status = normalizeMidtransPaymentStatus(body)
	}
	if !validPaymentStatus(status) {
		writeError(w, http.StatusBadRequest, "payment status is invalid.")
		return
	}

	statusBefore := payment.Status
	payment.Status = status
	if body.TransactionID != "" {
		payment.ProviderRef = &body.TransactionID
	}
	payment.UpdatedAt = time.Now()

	if err := s.store.UpdatePayment(payment); err != nil {
		s.recordMonitoringError(r, "payment", payment.ID, "Failed to confirm payment.", map[string]any{
			"error":        err.Error(),
			"statusBefore": statusBefore,
			"statusAfter":  payment.Status,
		})
		writeError(w, http.StatusInternalServerError, "Failed to update payment.")
		return
	}
	if err := s.insertPaymentLog(r, "payment.customer_confirm", payment, &statusBefore, map[string]any{
		"paymentId":         payment.ID,
		"sessionId":         payment.SessionID,
		"status":            status,
		"orderId":           body.OrderID,
		"transactionStatus": body.TransactionStatus,
		"fraudStatus":       body.FraudStatus,
		"statusCode":        body.StatusCode,
		"grossAmount":       body.GrossAmount,
		"paymentType":       body.PaymentType,
		"transactionId":     body.TransactionID,
	}); err != nil {
		s.recordMonitoringError(r, "payment", payment.ID, "Failed to save payment confirmation log.", map[string]any{
			"error":        err.Error(),
			"statusBefore": statusBefore,
			"statusAfter":  payment.Status,
		})
		writeError(w, http.StatusInternalServerError, "Failed to save payment log.")
		return
	}

	if status == "paid" || status == "success" {
		session.Status = "paid"
		session.UpdatedAt = time.Now()
		_ = s.store.UpdateSession(session)
	}
	s.auditWithMetadata(r, nil, "payment.customer_confirm", payment.ID, true, map[string]any{
		"payment": map[string]any{
			"id":           payment.ID,
			"sessionId":    payment.SessionID,
			"provider":     payment.Provider,
			"statusBefore": statusBefore,
			"statusAfter":  payment.Status,
		},
	})

	writeJSON(w, http.StatusOK, response{Data: payment})
}

func (s *Server) handlePaymentWebhook(w http.ResponseWriter, r *http.Request, paymentID string) {
	if !s.allowRequest(r, "payment-webhook", 60) {
		writeError(w, http.StatusTooManyRequests, "Too many webhook requests. Please wait before trying again.")
		return
	}

	var body models.PaymentWebhookRequest
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	targetID := paymentID
	if body.PaymentID != "" {
		targetID = body.PaymentID
	}
	if body.OrderID != "" {
		targetID = body.OrderID
	}
	if paymentID == "midtrans" || paymentID == "notification" {
		targetID = body.OrderID
	}
	if targetID == "" {
		writeError(w, http.StatusBadRequest, "paymentId or order_id is required.")
		return
	}

	if err := s.verifyPaymentWebhook(r, body); err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	payment, ok := s.store.FindPayment(targetID)
	if !ok {
		writeError(w, http.StatusNotFound, "Payment not found.")
		return
	}

	status := body.Status
	if status == "" {
		status = normalizeMidtransPaymentStatus(body)
	}
	if !validPaymentStatus(status) {
		writeError(w, http.StatusBadRequest, "payment status is invalid.")
		return
	}
	statusBefore := payment.Status
	payment.Status = status
	payment.UpdatedAt = time.Now()

	if err := s.store.UpdatePayment(payment); err != nil {
		s.recordMonitoringError(r, "payment", payment.ID, "Failed to update payment.", map[string]any{
			"error":        err.Error(),
			"statusBefore": statusBefore,
			"statusAfter":  payment.Status,
		})
		writeError(w, http.StatusInternalServerError, "Failed to update payment.")
		return
	}
	if err := s.insertPaymentLog(r, "payment.webhook", payment, &statusBefore, map[string]any{
		"paymentId":         body.PaymentID,
		"sessionId":         body.SessionID,
		"status":            status,
		"orderId":           body.OrderID,
		"transactionStatus": body.TransactionStatus,
		"fraudStatus":       body.FraudStatus,
		"statusCode":        body.StatusCode,
		"grossAmount":       body.GrossAmount,
		"paymentType":       body.PaymentType,
		"transactionId":     body.TransactionID,
	}); err != nil {
		s.recordMonitoringError(r, "payment", payment.ID, "Failed to save payment webhook log.", map[string]any{
			"error":        err.Error(),
			"statusBefore": statusBefore,
			"statusAfter":  payment.Status,
		})
		writeError(w, http.StatusInternalServerError, "Failed to save payment log.")
		return
	}

	if status == "paid" || status == "success" {
		if session, ok := s.store.FindSession(payment.SessionID); ok {
			session.Status = "paid"
			session.UpdatedAt = time.Now()
			_ = s.store.UpdateSession(session)
		}
	}
	s.auditWithMetadata(r, nil, "payment.webhook", payment.ID, true, map[string]any{
		"payment": map[string]any{
			"id":           payment.ID,
			"sessionId":    payment.SessionID,
			"provider":     payment.Provider,
			"amount":       payment.Amount,
			"currency":     payment.Currency,
			"statusBefore": statusBefore,
			"statusAfter":  payment.Status,
		},
		"webhook": map[string]any{
			"paymentId":         body.PaymentID,
			"sessionId":         body.SessionID,
			"status":            status,
			"orderId":           body.OrderID,
			"transactionStatus": body.TransactionStatus,
			"fraudStatus":       body.FraudStatus,
		},
	})

	writeJSON(w, http.StatusOK, response{Data: payment})
}

func (s *Server) createMidtransSnap(_ *http.Request, payment models.Payment, session models.Session) (string, string, error) {
	if strings.TrimSpace(s.cfg.MidtransServerKey) == "" {
		return "", "", errors.New("Midtrans server key is not configured.")
	}

	customer := &midtrans.CustomerDetails{}
	if session.Email != nil && *session.Email != "" {
		customer.Email = *session.Email
	}
	if session.Phone != nil && *session.Phone != "" {
		customer.Phone = *session.Phone
	}
	if customer.Email == "" && customer.Phone == "" {
		customer = nil
	}

	items := []midtrans.ItemDetails{
		{
			ID:    "photobooth-session",
			Price: payment.Amount,
			Qty:   1,
			Name:  "Urbanmenphoto Photobooth",
		},
	}

	env := midtrans.Sandbox
	if strings.EqualFold(strings.TrimSpace(s.cfg.MidtransEnvironment), "production") {
		env = midtrans.Production
	}

	client := snap.Client{}
	client.New(strings.TrimSpace(s.cfg.MidtransServerKey), env)

	snapResponse, midtransErr := client.CreateTransaction(&snap.Request{
		TransactionDetails: midtrans.TransactionDetails{
			OrderID:  payment.ID,
			GrossAmt: payment.Amount,
		},
		Items:          &items,
		CustomerDetail: customer,
		CreditCard: &snap.CreditCardDetails{
			Secure: true,
		},
	})
	if midtransErr != nil {
		return "", "", fmt.Errorf("Midtrans returned %d: %s", midtransErr.GetStatusCode(), midtransErr.GetMessage())
	}
	if snapResponse == nil {
		return "", "", errors.New("Midtrans response is empty.")
	}
	if snapResponse.Token == "" {
		return "", "", errors.New("Midtrans response does not include snap token.")
	}
	return snapResponse.Token, snapResponse.RedirectURL, nil
}

func (s *Server) createMidtransQRIS(payment models.Payment, session models.Session) (string, string, string, error) {
	if strings.TrimSpace(s.cfg.MidtransServerKey) == "" {
		return "", "", "", errors.New("Midtrans server key is not configured.")
	}
	endpoint := "https://api.sandbox.midtrans.com/v2/charge"
	if strings.EqualFold(strings.TrimSpace(s.cfg.MidtransEnvironment), "production") {
		endpoint = "https://api.midtrans.com/v2/charge"
	}
	payload := map[string]any{
		"payment_type":        "qris",
		"transaction_details": map[string]any{"order_id": payment.ID, "gross_amount": payment.Amount},
		"item_details":        []map[string]any{{"id": "photobooth-session", "price": payment.Amount, "quantity": 1, "name": "Urbanmenphoto Photobooth"}},
		"qris":                map[string]any{"acquirer": "gopay"},
	}
	if session.Email != nil && *session.Email != "" {
		payload["customer_details"] = map[string]any{"email": *session.Email}
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", "", "", err
	}
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", "", "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.SetBasicAuth(strings.TrimSpace(s.cfg.MidtransServerKey), "")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "", "", err
	}
	defer res.Body.Close()
	var response struct {
		StatusMessage string `json:"status_message"`
		QRString      string `json:"qr_string"`
		Actions       []struct {
			Name string `json:"name"`
			URL  string `json:"url"`
		} `json:"actions"`
	}
	if err := json.NewDecoder(res.Body).Decode(&response); err != nil {
		return "", "", "", err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", "", "", fmt.Errorf("Midtrans QRIS returned %d: %s", res.StatusCode, response.StatusMessage)
	}
	qrURL := ""
	for _, action := range response.Actions {
		if action.Name == "generate-qr-code-v2" && action.URL != "" {
			qrURL = action.URL
			break
		}
		if action.Name == "generate-qr-code" && action.URL != "" && qrURL == "" {
			qrURL = action.URL
		}
	}
	if response.QRString != "" {
		return response.QRString, "", qrURL, nil
	}
	if qrURL == "" {
		return "", "", "", errors.New("Midtrans QRIS response does not include a QR code action.")
	}
	// Midtrans explicitly supports displaying this transaction-specific action
	// URL in an <img>. This avoids a second server-to-server request that can
	// fail in a serverless runtime while creating an otherwise valid QRIS charge.
	return "", "", qrURL, nil
}

func (s *Server) verifyPaymentWebhook(r *http.Request, body models.PaymentWebhookRequest) error {
	if s.cfg.PaymentWebhookSecret != "" && r.Header.Get("x-webhook-secret") == s.cfg.PaymentWebhookSecret {
		return nil
	}
	if body.SignatureKey != "" {
		if s.cfg.MidtransServerKey == "" {
			return errors.New("Midtrans server key is not configured.")
		}
		orderID := body.OrderID
		if orderID == "" {
			orderID = body.PaymentID
		}
		raw := orderID + body.StatusCode + body.GrossAmount + s.cfg.MidtransServerKey
		sum := sha512.Sum512([]byte(raw))
		expected := fmt.Sprintf("%x", sum)
		if subtle.ConstantTimeCompare([]byte(expected), []byte(strings.ToLower(body.SignatureKey))) == 1 {
			return nil
		}
		return errors.New("Midtrans signature is invalid.")
	}
	if s.cfg.PaymentWebhookSecret != "" {
		return errors.New("Payment webhook secret is invalid or missing.")
	}
	return nil
}

func normalizeMidtransPaymentStatus(body models.PaymentWebhookRequest) string {
	status := strings.ToLower(strings.TrimSpace(body.TransactionStatus))
	fraud := strings.ToLower(strings.TrimSpace(body.FraudStatus))
	switch status {
	case "settlement":
		return "paid"
	case "capture":
		if fraud == "" || fraud == "accept" {
			return "paid"
		}
		return "pending"
	case "pending":
		return "pending"
	case "expire":
		return "expired"
	case "cancel":
		return "cancelled"
	case "deny", "failure":
		return "failed"
	default:
		return strings.ToLower(strings.TrimSpace(body.Status))
	}
}

func (s *Server) insertPaymentLog(r *http.Request, event string, payment models.Payment, statusBefore *string, payload map[string]any) error {
	if payload == nil {
		payload = map[string]any{}
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		payloadBytes = []byte("{}")
	}

	return s.store.InsertPaymentLog(models.PaymentLog{
		ID:             newID(),
		PaymentID:      payment.ID,
		SessionID:      payment.SessionID,
		Event:          event,
		Provider:       payment.Provider,
		Amount:         payment.Amount,
		Currency:       payment.Currency,
		StatusBefore:   statusBefore,
		StatusAfter:    payment.Status,
		ProviderRef:    payment.ProviderRef,
		RequestPayload: string(payloadBytes),
		IP:             clientIP(r),
		UserAgent:      r.UserAgent(),
		CreatedAt:      time.Now(),
	})
}

func (s *Server) serveKioskFrontend(w http.ResponseWriter, r *http.Request) bool {
	distDir := strings.TrimSpace(s.cfg.FrontendDistDir)
	if distDir == "" {
		return false
	}
	indexPath := filepath.Join(distDir, "index.html")
	if info, err := os.Stat(indexPath); err != nil || info.IsDir() {
		return false
	}

	relativePath := strings.TrimPrefix(filepath.Clean(r.URL.Path), "/")
	if relativePath == "." || relativePath == "" {
		http.ServeFile(w, r, indexPath)
		return true
	}
	if strings.HasPrefix(relativePath, "..") {
		writeError(w, http.StatusBadRequest, "Invalid file path.")
		return true
	}
	filePath := filepath.Join(distDir, relativePath)
	if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
		http.ServeFile(w, r, filePath)
		return true
	}

	// SPA routes such as /admin and /gallery/:id must load the Vite entrypoint.
	http.ServeFile(w, r, indexPath)
	return true
}

func (s *Server) upsertFrame(w http.ResponseWriter, r *http.Request, frameID string, actorID *string) {
	var body models.UpsertFrameRequest
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required.")
		return
	}
	if body.ImageURL == "" {
		writeError(w, http.StatusBadRequest, "imageUrl is required.")
		return
	}

	now := time.Now()
	id := frameID
	if id == "" {
		id = body.ID
	}
	if id == "" {
		id = "frame-" + shortCode()
	}

	active := true
	if body.Active != nil {
		active = *body.Active
	}
	category := body.Category
	if category == "" {
		category = "custom"
	}
	templateType := body.TemplateType
	if templateType == "" {
		templateType = "strip"
	}
	if templateType != "strip" && templateType != "print_sheet" {
		writeError(w, http.StatusBadRequest, "templateType must be strip or print_sheet.")
		return
	}
	paperSize := body.PaperSize
	if paperSize == "" {
		paperSize = "strip-2x6"
	}
	orientation := body.Orientation
	if orientation == "" {
		orientation = "portrait"
	}
	if orientation != "portrait" && orientation != "landscape" {
		writeError(w, http.StatusBadRequest, "orientation must be portrait or landscape.")
		return
	}
	printMode := body.PrintMode
	if printMode == "" {
		printMode = "auto"
	}
	printCopies := body.PrintCopies
	if printCopies <= 0 {
		printCopies = 2
	}

	frame := models.Frame{
		ID:           id,
		Name:         body.Name,
		Category:     category,
		LayoutCount:  body.LayoutCount,
		ImageURL:     body.ImageURL,
		SlotJSON:     body.SlotJSON,
		TemplateType: templateType,
		PaperSize:    paperSize,
		Orientation:  orientation,
		PrintMode:    printMode,
		PrintCopies:  printCopies,
		Active:       active,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	if err := s.store.UpsertFrame(frame); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to save frame.")
		return
	}
	s.auditWithMetadata(r, actorID, "admin.frame.upsert", frame.ID, true, map[string]any{
		"frame": map[string]any{
			"id":           frame.ID,
			"name":         frame.Name,
			"category":     frame.Category,
			"layoutCount":  frame.LayoutCount,
			"templateType": frame.TemplateType,
			"paperSize":    frame.PaperSize,
			"orientation":  frame.Orientation,
			"printMode":    frame.PrintMode,
			"printCopies":  frame.PrintCopies,
			"active":       frame.Active,
		},
	})

	writeJSON(w, http.StatusOK, response{Data: frame})
}

func (s *Server) upsertVoucher(w http.ResponseWriter, r *http.Request, voucherID string, actorID *string) {
	var body models.UpsertVoucherRequest
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	code := normalizeVoucherCode(body.Code)
	if !validVoucherCode(code) {
		writeError(w, http.StatusBadRequest, "voucher code may only contain letters, numbers, dashes, or underscores.")
		return
	}

	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = code
	}
	if len(name) > 80 {
		writeError(w, http.StatusBadRequest, "name is too long.")
		return
	}

	voucherType := strings.ToLower(strings.TrimSpace(body.Type))
	if voucherType == "" {
		voucherType = "fixed"
	}
	if voucherType != "fixed" && voucherType != "percent" {
		writeError(w, http.StatusBadRequest, "type must be fixed or percent.")
		return
	}
	if body.Value <= 0 {
		writeError(w, http.StatusBadRequest, "value must be greater than zero.")
		return
	}
	if voucherType == "percent" && body.Value > 100 {
		writeError(w, http.StatusBadRequest, "percent voucher value cannot exceed 100.")
		return
	}
	if body.MinAmount < 0 || body.MaxDiscount < 0 || body.UsageLimit < 0 {
		writeError(w, http.StatusBadRequest, "amount and usage values cannot be negative.")
		return
	}
	if body.StartsAt != nil && body.EndsAt != nil && body.EndsAt.Before(*body.StartsAt) {
		writeError(w, http.StatusBadRequest, "endsAt cannot be before startsAt.")
		return
	}

	id := voucherID
	if id == "" {
		id = strings.TrimSpace(body.ID)
	}
	now := time.Now()
	createdAt := now
	usedCount := 0
	for _, voucher := range s.store.ListVouchers() {
		if strings.EqualFold(voucher.Code, code) && voucher.ID != id {
			writeError(w, http.StatusConflict, "voucher code already exists.")
			return
		}
		if voucher.ID == id {
			createdAt = voucher.CreatedAt
			usedCount = voucher.UsedCount
		}
	}
	if id == "" {
		id = "voucher-" + shortCode()
	}

	active := true
	if body.Active != nil {
		active = *body.Active
	}

	voucher := models.Voucher{
		ID:          id,
		Code:        code,
		Name:        name,
		Type:        voucherType,
		Value:       body.Value,
		MinAmount:   body.MinAmount,
		MaxDiscount: body.MaxDiscount,
		UsageLimit:  body.UsageLimit,
		UsedCount:   usedCount,
		Active:      active,
		StartsAt:    body.StartsAt,
		EndsAt:      body.EndsAt,
		CreatedBy:   actorID,
		CreatedAt:   createdAt,
		UpdatedAt:   now,
	}

	if err := s.store.UpsertVoucher(voucher); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to save voucher.")
		return
	}
	s.auditWithMetadata(r, actorID, "admin.voucher.upsert", voucher.ID, true, map[string]any{
		"voucher": voucherAuditPayload(voucher),
	})

	writeJSON(w, http.StatusOK, response{Data: voucher})
}

func normalizeVoucherCode(value string) string {
	return strings.ToUpper(strings.TrimSpace(value))
}

func validVoucherCode(value string) bool {
	return validSlug(value, 32)
}

func voucherAuditPayload(voucher models.Voucher) map[string]any {
	return map[string]any{
		"id":          voucher.ID,
		"code":        voucher.Code,
		"name":        voucher.Name,
		"type":        voucher.Type,
		"value":       voucher.Value,
		"minAmount":   voucher.MinAmount,
		"maxDiscount": voucher.MaxDiscount,
		"usageLimit":  voucher.UsageLimit,
		"usedCount":   voucher.UsedCount,
		"active":      voucher.Active,
		"startsAt":    voucher.StartsAt,
		"endsAt":      voucher.EndsAt,
	}
}

func (s *Server) createAdminUser(w http.ResponseWriter, r *http.Request, actorID *string) {
	var body models.CreateAdminUserRequest
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	email := strings.ToLower(strings.TrimSpace(body.Email))
	if !validEmail(email) {
		writeError(w, http.StatusBadRequest, "email is invalid.")
		return
	}
	if _, exists := s.store.FindAdminUserByEmail(email); exists {
		writeError(w, http.StatusConflict, "Admin user already exists.")
		return
	}
	role := normalizeAdminRole(body.Role)
	if role == "" {
		writeError(w, http.StatusBadRequest, "role must be owner or staff.")
		return
	}

	passwordHash, err := auth.HashPassword(body.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	now := time.Now()
	user := models.AdminUser{
		ID:           "admin-" + shortCode(),
		Email:        email,
		PasswordHash: passwordHash,
		Role:         role,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := s.store.UpsertAdminUser(user); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to save admin user.")
		return
	}
	s.auditWithMetadata(r, actorID, "admin.user.create", user.ID, true, map[string]any{
		"createdUser": map[string]any{
			"id":    user.ID,
			"email": user.Email,
			"role":  user.Role,
		},
	})

	writeJSON(w, http.StatusCreated, response{Data: adminUserView(user)})
}

func (s *Server) updateAdminUser(w http.ResponseWriter, r *http.Request, userID string, actorID *string) {
	var body models.UpdateAdminUserRequest
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	user, ok := s.store.FindAdminUserByID(userID)
	if !ok {
		writeError(w, http.StatusNotFound, "Admin user not found.")
		return
	}
	before := adminUserView(user)
	passwordChanged := false

	if body.Role != "" {
		role := normalizeAdminRole(body.Role)
		if role == "" {
			writeError(w, http.StatusBadRequest, "role must be owner or staff.")
			return
		}
		user.Role = role
	}
	if body.Password != "" {
		passwordHash, err := auth.HashPassword(body.Password)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		user.PasswordHash = passwordHash
		passwordChanged = true
	}
	user.UpdatedAt = time.Now()

	if err := s.store.UpsertAdminUser(user); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update admin user.")
		return
	}
	after := adminUserView(user)
	s.auditWithMetadata(r, actorID, "admin.user.update", user.ID, true, map[string]any{
		"before":          before,
		"after":           after,
		"passwordChanged": passwordChanged,
		"changes": map[string]any{
			"role": map[string]any{
				"before": before.Role,
				"after":  after.Role,
			},
			"password": map[string]any{
				"changed": passwordChanged,
			},
		},
	})

	writeJSON(w, http.StatusOK, response{Data: adminUserView(user)})
}

func (s *Server) newSession(body models.CreateSessionRequest) (models.Session, string) {
	now := time.Now()
	id := body.ID
	if id == "" {
		id = newID()
	}
	customerToken := newID() + "." + shortCode()

	status := body.Status
	if status == "" {
		status = "created"
	}

	return models.Session{
		ID:                id,
		ShortCode:         shortCode(),
		Email:             body.Email,
		Phone:             body.Phone,
		LayoutID:          body.LayoutID,
		PaperSize:         body.PaperSize,
		FrameID:           body.FrameID,
		Status:            status,
		Images:            []string{},
		DownloadURL:       s.cfg.PublicBaseURL + "/gallery/" + id,
		CustomerTokenHash: auth.HashToken(customerToken),
		CreatedAt:         now,
		UpdatedAt:         now,
		ExpiresAt:         now.AddDate(0, 0, sessionRetentionDays(s.cfg.SessionTTLDays)),
	}, customerToken
}

func sessionRetentionDays(_ int) int {
	return config.SessionRetentionDays
}

func normalizeErrorCategory(category string) string {
	switch strings.ToLower(strings.TrimSpace(category)) {
	case "save_photo", "save-photo", "photo_save", "photo-save", "finalize":
		return "save_photo"
	case "print", "print_photo", "print-photo":
		return "print"
	case "whatsapp", "send_link", "send-link", "message":
		return "whatsapp"
	case "payment", "payment_failed", "payment-failed":
		return "payment"
	default:
		return "system"
	}
}

func (s *Server) saveDataURL(sessionID string, dataURL string, fileStem string) (models.StoredImage, error) {
	decoded, err := parseDataURL(dataURL)
	if err != nil {
		return models.StoredImage{}, err
	}
	return s.saveDecodedImage(sessionID, fileStem, decoded)
}

func (s *Server) saveAnimatedDataURL(sessionID string, dataURL string, fileStem string) (models.StoredImage, error) {
	decoded, err := parseAnimatedDataURL(dataURL)
	if err != nil {
		return models.StoredImage{}, err
	}
	return s.saveDecodedImage(sessionID, fileStem, decoded)
}

func (s *Server) saveDecodedImage(sessionID string, fileStem string, decoded imageData) (models.StoredImage, error) {
	sessionDir := filepath.Join(s.cfg.StorageDir, "sessions", sessionID)
	if err := os.MkdirAll(sessionDir, 0755); err != nil {
		return models.StoredImage{}, err
	}

	fileName := fileStem + "." + decoded.Ext
	key := filepath.Join("sessions", sessionID, fileName)
	filePath := filepath.Join(s.cfg.StorageDir, key)

	if err := os.WriteFile(filePath, decoded.Bytes, 0644); err != nil {
		return models.StoredImage{}, err
	}

	return models.StoredImage{
		Key:      filepath.ToSlash(key),
		URL:      s.cfg.PublicBaseURL + "/files/" + filepath.ToSlash(key),
		MimeType: decoded.MimeType,
		Size:     int64(len(decoded.Bytes)),
	}, nil
}

func (s *Server) requireAdmin(r *http.Request) (models.AdminUser, error) {
	tokenHash, err := adminTokenHashFromRequest(r)
	if err != nil {
		return models.AdminUser{}, err
	}

	token, ok := s.store.FindAdminTokenByHash(tokenHash)
	if !ok || time.Now().After(token.ExpiresAt) {
		return models.AdminUser{}, errors.New("Admin bearer token is invalid or expired.")
	}

	user, ok := s.store.FindAdminUserByID(token.UserID)
	if !ok {
		return models.AdminUser{}, errors.New("Admin user no longer exists.")
	}
	now := time.Now()
	token.LastUsedAt = &now
	_ = s.store.UpdateAdminToken(token)

	return user, nil
}

func requireCustomerSession(r *http.Request, session models.Session) error {
	if session.CustomerTokenHash == "" {
		return nil
	}

	token := strings.TrimSpace(r.Header.Get("x-session-token"))
	if token == "" {
		return errors.New("Customer session token is missing.")
	}

	tokenHash := auth.HashToken(token)
	if subtle.ConstantTimeCompare([]byte(tokenHash), []byte(session.CustomerTokenHash)) != 1 {
		return errors.New("Customer session token is invalid.")
	}
	return nil
}

func sessionResponse(session models.Session, customerToken string) models.Session {
	session.CustomerTokenHash = ""
	session.CustomerToken = customerToken
	return session
}

func sessionResponses(sessions []models.Session) []models.Session {
	responses := make([]models.Session, 0, len(sessions))
	for _, session := range sessions {
		responses = append(responses, sessionResponse(session, ""))
	}
	return responses
}

func parsePagination(r *http.Request) (int, int) {
	page := parsePositiveInt(r.URL.Query().Get("page"), 1)
	pageSize := parsePositiveInt(r.URL.Query().Get("pageSize"), 25)
	if pageSize > 100 {
		pageSize = 100
	}
	return page, pageSize
}

func parsePositiveInt(value string, fallback int) int {
	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func pageBounds(total int, page int, pageSize int) (int, int, int) {
	totalPages := 0
	if total > 0 {
		totalPages = (total + pageSize - 1) / pageSize
	}
	start := (page - 1) * pageSize
	if start > total {
		start = total
	}
	end := start + pageSize
	if end > total {
		end = total
	}
	return start, end, totalPages
}

func paginateSessions(r *http.Request, items []models.Session) models.PaginatedResponse {
	page, pageSize := parsePagination(r)
	start, end, totalPages := pageBounds(len(items), page, pageSize)
	return models.PaginatedResponse{Items: items[start:end], Total: len(items), Page: page, PageSize: pageSize, TotalPages: totalPages}
}

func paginatePayments(r *http.Request, items []models.Payment) models.PaginatedResponse {
	page, pageSize := parsePagination(r)
	start, end, totalPages := pageBounds(len(items), page, pageSize)
	return models.PaginatedResponse{Items: items[start:end], Total: len(items), Page: page, PageSize: pageSize, TotalPages: totalPages}
}

func paginateMessages(r *http.Request, items []models.Message) models.PaginatedResponse {
	page, pageSize := parsePagination(r)
	start, end, totalPages := pageBounds(len(items), page, pageSize)
	return models.PaginatedResponse{Items: items[start:end], Total: len(items), Page: page, PageSize: pageSize, TotalPages: totalPages}
}

func paginateAuditLogs(r *http.Request, items []models.AuditLog) models.PaginatedResponse {
	page, pageSize := parsePagination(r)
	start, end, totalPages := pageBounds(len(items), page, pageSize)
	return models.PaginatedResponse{Items: items[start:end], Total: len(items), Page: page, PageSize: pageSize, TotalPages: totalPages}
}

func filterSessions(items []models.Session, r *http.Request) []models.Session {
	query := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	status := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("status")))
	filtered := []models.Session{}
	for _, item := range items {
		if status != "" && strings.ToLower(item.Status) != status {
			continue
		}
		if query != "" && !strings.Contains(strings.ToLower(item.ID+" "+item.ShortCode+" "+item.Status), query) {
			continue
		}
		filtered = append(filtered, item)
	}
	return filtered
}

func filterPayments(items []models.Payment, r *http.Request) []models.Payment {
	query := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	status := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("status")))
	provider := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("provider")))
	filtered := []models.Payment{}
	for _, item := range items {
		if status != "" && strings.ToLower(item.Status) != status {
			continue
		}
		if provider != "" && strings.ToLower(item.Provider) != provider {
			continue
		}
		if query != "" && !strings.Contains(strings.ToLower(item.ID+" "+item.SessionID+" "+item.Provider+" "+item.Status), query) {
			continue
		}
		filtered = append(filtered, item)
	}
	return filtered
}

func filterMessages(items []models.Message, r *http.Request) []models.Message {
	query := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	channel := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("channel")))
	filtered := []models.Message{}
	for _, item := range items {
		if channel != "" && strings.ToLower(item.Channel) != channel {
			continue
		}
		recipient := ""
		if item.Recipient != nil {
			recipient = *item.Recipient
		}
		if query != "" && !strings.Contains(strings.ToLower(item.ID+" "+item.SessionID+" "+item.Channel+" "+recipient+" "+item.Status), query) {
			continue
		}
		filtered = append(filtered, item)
	}
	return filtered
}

func filterAuditLogs(items []models.AuditLog, r *http.Request) []models.AuditLog {
	query := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	action := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("action")))
	filtered := []models.AuditLog{}
	for _, item := range items {
		if action != "" && strings.ToLower(item.Action) != action {
			continue
		}
		actorID := ""
		if item.ActorID != nil {
			actorID = *item.ActorID
		}
		metadataText := ""
		if item.Metadata != nil {
			if metadataBytes, err := json.Marshal(item.Metadata); err == nil {
				metadataText = string(metadataBytes)
			}
		}
		if query != "" && !strings.Contains(strings.ToLower(item.ID+" "+item.Action+" "+item.Resource+" "+actorID+" "+item.IP+" "+metadataText), query) {
			continue
		}
		filtered = append(filtered, item)
	}
	return filtered
}

func auditLogsByResources(items []models.AuditLog, resources []string) []models.AuditLog {
	resourceSet := map[string]bool{}
	for _, resource := range resources {
		resourceSet[resource] = true
	}
	filtered := []models.AuditLog{}
	for _, item := range items {
		if resourceSet[item.Resource] {
			filtered = append(filtered, item)
		}
	}
	return filtered
}

func adminTokenHashFromRequest(r *http.Request) (string, error) {
	authHeader := r.Header.Get("authorization")
	if !strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return "", errors.New("Admin bearer token is missing.")
	}

	tokenValue := strings.TrimSpace(authHeader[len("Bearer "):])
	if tokenValue == "" {
		return "", errors.New("Admin bearer token is missing.")
	}
	return auth.HashToken(tokenValue), nil
}

func (s *Server) requireOwner(r *http.Request) (models.AdminUser, error) {
	user, err := s.requireAdmin(r)
	if err != nil {
		return models.AdminUser{}, err
	}
	if user.Role != "owner" {
		return models.AdminUser{}, errors.New("Owner admin role is required.")
	}
	return user, nil
}

func adminUserView(user models.AdminUser) models.AdminUserView {
	return models.AdminUserView{
		ID:        user.ID,
		Email:     user.Email,
		Role:      user.Role,
		CreatedAt: user.CreatedAt,
		UpdatedAt: user.UpdatedAt,
	}
}

func adminUserViews(users []models.AdminUser) []models.AdminUserView {
	views := make([]models.AdminUserView, 0, len(users))
	for _, user := range users {
		views = append(views, adminUserView(user))
	}
	return views
}

func parseDataURL(dataURL string) (imageData, error) {
	return parseDataURLWithAllowedMIMEs(dataURL, validImageMime)
}

func parseAnimatedDataURL(dataURL string) (imageData, error) {
	return parseDataURLWithAllowedMIMEs(dataURL, func(value string) bool {
		return validImageMime(value) || value == "image/gif"
	})
}

func parseDataURLWithAllowedMIMEs(dataURL string, allowMime func(string) bool) (imageData, error) {
	matches := dataURLPattern.FindStringSubmatch(dataURL)
	if len(matches) != 3 {
		return imageData{}, errors.New("invalid data URL")
	}

	mimeType := strings.ToLower(strings.TrimSpace(matches[1]))
	if !allowMime(mimeType) {
		return imageData{}, errors.New("unsupported image mime type")
	}

	raw, err := base64.StdEncoding.DecodeString(matches[2])
	if err != nil {
		return imageData{}, err
	}
	if len(raw) == 0 {
		return imageData{}, errors.New("image is empty")
	}
	if len(raw) > maxDataURLImageSize {
		return imageData{}, errors.New("image is too large")
	}

	detected := detectImageMIME(raw)
	if detected == "" {
		return imageData{}, errors.New("image bytes are invalid")
	}
	if detected != mimeType {
		return imageData{}, errors.New("image mime type does not match image bytes")
	}

	ext := strings.TrimPrefix(mimeType, "image/")
	if ext == "jpeg" {
		ext = "jpg"
	}
	if ext == "" || strings.Contains(ext, "/") {
		ext = "bin"
	}

	return imageData{
		MimeType: mimeType,
		Ext:      ext,
		Bytes:    raw,
	}, nil
}

func readJSON(r *http.Request, target any) error {
	defer r.Body.Close()
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		if errors.Is(err, io.EOF) {
			return errors.New("JSON body is required.")
		}
		return err
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, body response) {
	w.Header().Set("content-type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, response{Error: &apiError{Message: message}})
}

func pathIDAndAction(path string, prefix string) (string, string) {
	rest := strings.Trim(strings.TrimPrefix(path, prefix), "/")
	parts := strings.Split(rest, "/")
	if len(parts) == 0 {
		return "", ""
	}
	if len(parts) == 1 {
		return parts[0], ""
	}
	return parts[0], parts[1]
}

func newID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return shortCode() + shortCode()
	}

	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80

	return hex.EncodeToString(bytes[0:4]) + "-" +
		hex.EncodeToString(bytes[4:6]) + "-" +
		hex.EncodeToString(bytes[6:8]) + "-" +
		hex.EncodeToString(bytes[8:10]) + "-" +
		hex.EncodeToString(bytes[10:16])
}

func shortCode() string {
	bytes := make([]byte, 5)
	if _, err := rand.Read(bytes); err != nil {
		return "local"
	}
	return hex.EncodeToString(bytes)
}

func firstString(values ...*string) *string {
	for _, value := range values {
		if value != nil && *value != "" {
			return value
		}
	}
	return nil
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

func countFiles(root string) int {
	count := 0
	_ = filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return nil
		}
		count++
		return nil
	})
	return count
}

func countFilesAndBytes(root string) (int, int64) {
	count := 0
	var totalBytes int64
	_ = filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return nil
		}
		count++
		if info, statErr := entry.Info(); statErr == nil {
			totalBytes += info.Size()
		}
		return nil
	})
	return count, totalBytes
}

func resolveLocalFile(paths ...string) string {
	for _, path := range paths {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}
	return paths[0]
}

func (s *Server) allowRequest(r *http.Request, scope string, limit int) bool {
	return s.limiter.allow(scope+":"+clientIP(r), limit)
}

func validEmail(value string) bool {
	value = strings.TrimSpace(value)
	return len(value) <= 254 && emailPattern.MatchString(value)
}

func validPhone(value string) bool {
	value = strings.TrimSpace(strings.ReplaceAll(value, " ", ""))
	return phonePattern.MatchString(value)
}

func validSlug(value string, maxLength int) bool {
	if value == "" || len(value) > maxLength {
		return false
	}
	for _, char := range value {
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || char == '-' || char == '_' {
			continue
		}
		return false
	}
	return true
}

func validPaymentStatus(value string) bool {
	switch value {
	case "pending", "paid", "success", "failed", "expired", "cancelled":
		return true
	default:
		return false
	}
}

func normalizeAdminRole(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "staff":
		return "staff"
	case "owner":
		return "owner"
	default:
		return ""
	}
}

func validateContact(email *string, phone *string) error {
	if email != nil && *email != "" && !validEmail(*email) {
		return errors.New("email is invalid")
	}
	if phone != nil && *phone != "" && !validPhone(*phone) {
		return errors.New("phone is invalid")
	}
	return nil
}

func validImageMime(value string) bool {
	switch value {
	case "image/png", "image/jpeg", "image/webp":
		return true
	default:
		return false
	}
}

func detectImageMIME(raw []byte) string {
	if len(raw) >= 3 && raw[0] == 0xff && raw[1] == 0xd8 && raw[2] == 0xff {
		return "image/jpeg"
	}
	if len(raw) >= 8 &&
		raw[0] == 0x89 &&
		raw[1] == 0x50 &&
		raw[2] == 0x4e &&
		raw[3] == 0x47 &&
		raw[4] == 0x0d &&
		raw[5] == 0x0a &&
		raw[6] == 0x1a &&
		raw[7] == 0x0a {
		return "image/png"
	}
	if len(raw) >= 12 &&
		string(raw[0:4]) == "RIFF" &&
		string(raw[8:12]) == "WEBP" {
		return "image/webp"
	}
	if len(raw) >= 6 && (string(raw[0:6]) == "GIF87a" || string(raw[0:6]) == "GIF89a") {
		return "image/gif"
	}
	return ""
}

func (s *Server) recordFailedLogin(email string) {
	now := time.Now()
	attempt, _ := s.store.FindLoginAttempt(email)
	attempt.Email = email
	attempt.FailedCount++
	attempt.LastAttemptAt = now
	if attempt.FailedCount >= 5 {
		lockedUntil := now.Add(15 * time.Minute)
		attempt.LockedUntil = &lockedUntil
	}
	_ = s.store.UpsertLoginAttempt(attempt)
}

func (s *Server) clearLoginAttempt(email string) {
	_ = s.store.UpsertLoginAttempt(models.LoginAttempt{
		Email:         email,
		FailedCount:   0,
		LastAttemptAt: time.Now(),
	})
}

func (s *Server) audit(r *http.Request, actorID *string, action string, resource string, success bool) {
	s.auditWithMetadata(r, actorID, action, resource, success, nil)
}

func (s *Server) auditWithMetadata(r *http.Request, actorID *string, action string, resource string, success bool, metadata map[string]any) {
	if metadata == nil {
		metadata = map[string]any{}
	}
	_ = s.store.InsertAuditLog(models.AuditLog{
		ID:        newID(),
		ActorID:   actorID,
		Action:    action,
		Resource:  resource,
		Metadata:  metadata,
		IP:        clientIP(r),
		UserAgent: r.UserAgent(),
		Success:   success,
		CreatedAt: time.Now(),
	})
}

func (s *Server) recordMonitoringError(r *http.Request, category string, resource string, message string, metadata map[string]any) {
	category = normalizeErrorCategory(category)
	if strings.TrimSpace(resource) == "" {
		resource = category
	}
	if strings.TrimSpace(message) == "" {
		message = "Unknown error"
	}
	if len(message) > 400 {
		message = message[:400]
	}
	if metadata == nil {
		metadata = map[string]any{}
	}
	metadata["category"] = category
	metadata["message"] = message
	metadata["source"] = "backend"
	s.auditWithMetadata(r, nil, "monitoring.error."+category, resource, false, metadata)
}

// Wallet Handlers

func (s *Server) handleAdminWallet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	settings := s.store.GetWalletSettings()
	withdrawals := s.store.ListWithdrawals()

	payments := s.store.ListPayments()
	var totalEarnings int64 = 0
	for _, p := range payments {
		if p.Status == "settlement" || p.Status == "paid" {
			totalEarnings += p.Amount
		}
	}

	var totalWithdrawn int64 = 0
	for _, w := range withdrawals {
		if w.Status != "failed" {
			totalWithdrawn += w.Amount
		}
	}

	balance := totalEarnings - totalWithdrawn

	writeJSON(w, http.StatusOK, response{Data: map[string]interface{}{
		"settings":      settings,
		"withdrawals":   withdrawals,
		"totalEarnings": totalEarnings,
		"balance":       balance,
	}})
}

func (s *Server) handleAdminWalletSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var settings models.WalletSettings
	if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}
	if err := s.store.SaveWalletSettings(settings); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to save settings")
		return
	}
	
	_ = s.store.InsertAuditLog(models.AuditLog{
		ID:        fmt.Sprintf("%d", time.Now().UnixNano()),
		Action:    "UPDATE_WALLET_SETTINGS",
		Success:   true,
		CreatedAt: time.Now(),
	})
	
	writeJSON(w, http.StatusOK, response{Data: settings})
}

func (s *Server) handleAdminWalletWithdraw(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var req struct {
		Amount int64 `json:"amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}
	if req.Amount < 10000 {
		writeError(w, http.StatusBadRequest, "Minimum penarikan adalah Rp 10.000")
		return
	}

	// Calculate balance
	payments := s.store.ListPayments()
	var totalEarnings int64 = 0
	for _, p := range payments {
		if p.Status == "settlement" || p.Status == "paid" {
			totalEarnings += p.Amount
		}
	}
	withdrawals := s.store.ListWithdrawals()
	var totalWithdrawn int64 = 0
	for _, wd := range withdrawals {
		if wd.Status != "failed" {
			totalWithdrawn += wd.Amount
		}
	}
	balance := totalEarnings - totalWithdrawn
	
	if req.Amount > balance {
		writeError(w, http.StatusBadRequest, "Saldo tidak mencukupi")
		return
	}

	withdrawal := models.Withdrawal{
		ID:        "WD-" + fmt.Sprintf("%d", time.Now().UnixNano())[:8],
		Amount:    req.Amount,
		Fee:       0,
		Status:    "pending",
		Reference: "",
		CreatedAt: time.Now(),
	}

	if err := s.store.InsertWithdrawal(withdrawal); err != nil {
		writeError(w, http.StatusInternalServerError, "Gagal memproses penarikan")
		return
	}
	
	_ = s.store.InsertAuditLog(models.AuditLog{
		ID:        fmt.Sprintf("%d", time.Now().UnixNano()),
		Action:    "CREATE_WITHDRAWAL",
		Success:   true,
		CreatedAt: time.Now(),
	})
	
	writeJSON(w, http.StatusCreated, response{Data: withdrawal})
}

// Restored Handlers

func (s *Server) handleAdminFrameUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "File too large or invalid form")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "Missing 'file' field")
		return
	}
	defer file.Close()

	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".png"
	}
	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	
	framesDir := filepath.Join(s.cfg.StorageDir, "frames")
	if err := os.MkdirAll(framesDir, 0755); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not create directory")
		return
	}
	
	destPath := filepath.Join(framesDir, filename)
	destFile, err := os.Create(destPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not save file")
		return
	}
	defer destFile.Close()

	if _, err := io.Copy(destFile, file); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not write file")
		return
	}

	fileURL := s.cfg.PublicBaseURL + "/files/frames/" + filename
	writeJSON(w, http.StatusOK, response{Data: map[string]string{"url": fileURL}})
}

func (s *Server) handleAdminFilters(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, response{Data: s.store.ListFilters()})
	case http.MethodPost:
		var filter models.Filter
		if err := json.NewDecoder(r.Body).Decode(&filter); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid JSON payload")
			return
		}
		filter.CreatedAt = time.Now()
		filter.UpdatedAt = time.Now()
		if err := s.store.UpsertFilter(filter); err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to save filter")
			return
		}
		writeJSON(w, http.StatusCreated, response{Data: filter})
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (s *Server) handleAdminFilterByID(w http.ResponseWriter, r *http.Request) {
	filterID, _ := pathIDAndAction(r.URL.Path, "/api/admin/filters/")
	switch r.Method {
	case http.MethodPut:
		var filter models.Filter
		if err := json.NewDecoder(r.Body).Decode(&filter); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid JSON payload")
			return
		}
		filter.ID = filterID
		filter.UpdatedAt = time.Now()
		if err := s.store.UpsertFilter(filter); err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to update filter")
			return
		}
		writeJSON(w, http.StatusOK, response{Data: filter})
	case http.MethodDelete:
		if err := s.store.DeleteFilter(filterID); err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to delete filter")
			return
		}
		writeJSON(w, http.StatusOK, response{Data: map[string]string{"message": "Deleted"}})
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (s *Server) handleAdminBulkDeleteVouchers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	var req struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON payload.")
		return
	}
	deletedCount := 0
	for _, id := range req.IDs {
		if err := s.store.DeleteVoucher(id); err == nil {
			deletedCount++
		}
	}
	writeJSON(w, http.StatusOK, response{Data: map[string]int{"deleted": deletedCount}})
}

func (s *Server) handleAdminSubscriptions(w http.ResponseWriter, r *http.Request) {
	_, err := s.requireAdmin(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, response{Data: s.store.ListSubscriptions()})
	case http.MethodPost:
		var sub models.Subscription
		if err := json.NewDecoder(r.Body).Decode(&sub); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid request payload")
			return
		}
		if sub.ID == "" {
			sub.ID = "sub_" + shortCode()
		}
		sub.CreatedAt = time.Now()
		sub.UpdatedAt = time.Now()
		if err := s.store.UpsertSubscription(sub); err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to create subscription")
			return
		}
		writeJSON(w, http.StatusOK, response{Data: sub})
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (s *Server) handleAdminSubscriptionByID(w http.ResponseWriter, r *http.Request) {
	_, err := s.requireAdmin(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	subID, _ := pathIDAndAction(r.URL.Path, "/api/admin/subscriptions/")
	switch r.Method {
	case http.MethodPut:
		var sub models.Subscription
		if err := json.NewDecoder(r.Body).Decode(&sub); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid request payload")
			return
		}
		sub.ID = subID
		sub.UpdatedAt = time.Now()
		if err := s.store.UpsertSubscription(sub); err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to update subscription")
			return
		}
		writeJSON(w, http.StatusOK, response{Data: sub})
	case http.MethodDelete:
		if err := s.store.DeleteSubscription(subID); err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to delete subscription")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (s *Server) handleAdminPaymentKeys(w http.ResponseWriter, r *http.Request) {
	_, err := s.requireAdmin(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, response{Data: s.store.GetPaymentKey()})
	case http.MethodPut:
		var key models.PaymentKey
		if err := json.NewDecoder(r.Body).Decode(&key); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid request payload")
			return
		}
		if err := s.store.SavePaymentKey(key); err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to save payment keys")
			return
		}
		writeJSON(w, http.StatusOK, response{Data: key})
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (s *Server) handleAdminFramesGif(w http.ResponseWriter, r *http.Request) {
	_, err := s.requireAdmin(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, response{Data: s.store.ListFramesGif()})
	case http.MethodPost:
		var frame models.FrameGif
		if err := json.NewDecoder(r.Body).Decode(&frame); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid request payload")
			return
		}
		if frame.ID == "" {
			frame.ID = "custom_" + shortCode()
		}
		frame.CreatedAt = time.Now()
		frame.UpdatedAt = time.Now()
		if err := s.store.UpsertFrameGif(frame); err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to create frame gif")
			return
		}
		writeJSON(w, http.StatusOK, response{Data: frame})
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (s *Server) handleAdminFrameGifByID(w http.ResponseWriter, r *http.Request) {
	_, err := s.requireAdmin(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	frameID, _ := pathIDAndAction(r.URL.Path, "/api/admin/frames_gif/")
	switch r.Method {
	case http.MethodPut:
		var frame models.FrameGif
		if err := json.NewDecoder(r.Body).Decode(&frame); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid request payload")
			return
		}
		frame.ID = frameID
		frame.UpdatedAt = time.Now()
		if err := s.store.UpsertFrameGif(frame); err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to update frame gif")
			return
		}
		writeJSON(w, http.StatusOK, response{Data: frame})
	case http.MethodDelete:
		if err := s.store.DeleteFrameGif(frameID); err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to delete frame gif")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (s *Server) handleAdminFrameGifUpload(w http.ResponseWriter, r *http.Request) {
	// Re-use handleAdminFrameUpload logic but return custom URL
	// For simplicity, we just use the existing handleAdminFrameUpload because it uploads to the exact same storage bucket
	s.handleAdminFrameUpload(w, r)
}

