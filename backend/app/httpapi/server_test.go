package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"urbanmenphoto/backend/app/auth"
	"urbanmenphoto/backend/app/config"
	"urbanmenphoto/backend/app/models"
	"urbanmenphoto/backend/app/store"
)

const tinyPNGDataURL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
const tinyGIFDataURL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="

func TestKioskFrontendServesSPAAndAssets(t *testing.T) {
	distDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(distDir, "assets"), 0755); err != nil {
		t.Fatalf("create assets directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(distDir, "index.html"), []byte("<main>kiosk</main>"), 0644); err != nil {
		t.Fatalf("write index: %v", err)
	}
	if err := os.WriteFile(filepath.Join(distDir, "assets", "app.js"), []byte("console.log('kiosk')"), 0644); err != nil {
		t.Fatalf("write asset: %v", err)
	}

	handler := NewServer(config.Config{FrontendDistDir: distDir}, nil).Routes()
	for _, path := range []string{"/", "/admin", "/assets/app.js"} {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("expected %s to be served, got %d: %s", path, rec.Code, rec.Body.String())
		}
	}
}

func newTestServer(t *testing.T) http.Handler {
	t.Helper()

	tmpDir := t.TempDir()
	jsonStore, err := store.NewJSONStore(filepath.Join(tmpDir, "data"))
	if err != nil {
		t.Fatalf("store init failed: %v", err)
	}
	passwordHash, err := auth.HashPassword("test-password-123")
	if err != nil {
		t.Fatalf("hash test password: %v", err)
	}
	now := time.Now()
	if err := jsonStore.UpsertAdminUser(models.AdminUser{
		ID:           "admin-test",
		Email:        "admin@example.test",
		PasswordHash: passwordHash,
		Role:         "owner",
		CreatedAt:    now,
		UpdatedAt:    now,
	}); err != nil {
		t.Fatalf("seed admin user: %v", err)
	}

	server := NewServer(config.Config{
		Host:             "127.0.0.1",
		Port:             "8787",
		PublicBaseURL:    "http://example.test",
		AllowedOrigins:   []string{"http://localhost:5173"},
		DataDir:          filepath.Join(tmpDir, "data"),
		StorageDir:       filepath.Join(tmpDir, "storage"),
		SessionTTLDays:   7,
		AdminTokenTTLHrs: 12,
		MaxBodyBytes:     1024 * 1024,
	}, jsonStore)

	return server.Routes()
}

func loginAdmin(t *testing.T, handler http.Handler) string {
	t.Helper()

	body := bytes.NewBufferString(`{"email":"admin@example.test","password":"test-password-123"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/admin/auth/login", body)
	req.Header.Set("content-type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected admin login status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var loginResponse struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &loginResponse); err != nil {
		t.Fatalf("decode login response: %v", err)
	}
	if loginResponse.Data.Token == "" {
		t.Fatal("expected admin token")
	}
	return loginResponse.Data.Token
}

func createAndLoginStaff(t *testing.T, handler http.Handler) string {
	t.Helper()
	ownerToken := loginAdmin(t, handler)
	createReq := httptest.NewRequest(http.MethodPost, "/api/admin/users", bytes.NewBufferString(`{"email":"staff-report@example.test","password":"staff-password-123","role":"staff"}`))
	createReq.Header.Set("content-type", "application/json")
	createReq.Header.Set("authorization", "Bearer "+ownerToken)
	createRec := httptest.NewRecorder()
	handler.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected create staff status 201, got %d: %s", createRec.Code, createRec.Body.String())
	}

	loginReq := httptest.NewRequest(http.MethodPost, "/api/admin/auth/login", bytes.NewBufferString(`{"email":"staff-report@example.test","password":"staff-password-123"}`))
	loginReq.Header.Set("content-type", "application/json")
	loginRec := httptest.NewRecorder()
	handler.ServeHTTP(loginRec, loginReq)
	if loginRec.Code != http.StatusOK {
		t.Fatalf("expected staff login status 200, got %d: %s", loginRec.Code, loginRec.Body.String())
	}
	var loginResponse struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(loginRec.Body.Bytes(), &loginResponse); err != nil {
		t.Fatalf("decode staff login response: %v", err)
	}
	return loginResponse.Data.Token
}

func TestHealth(t *testing.T) {
	handler := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
	if rec.Header().Get("x-content-type-options") != "nosniff" {
		t.Fatal("expected security headers")
	}
}

func TestCORSWhitelist(t *testing.T) {
	handler := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("origin", "https://evil.example")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Header().Get("access-control-allow-origin") != "" {
		t.Fatal("expected disallowed origin to be omitted")
	}

	req = httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("origin", "http://localhost:5173")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Header().Get("access-control-allow-origin") != "http://localhost:5173" {
		t.Fatal("expected allowed origin header")
	}

	req = httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("origin", "http://tauri.localhost")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Header().Get("access-control-allow-origin") != "http://tauri.localhost" {
		t.Fatal("expected packaged Tauri kiosk origin to be allowed")
	}
}

func TestSwaggerSpec(t *testing.T) {
	handler := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/swagger/openapi.yaml", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte("openapi: 3.0.3")) {
		t.Fatalf("expected OpenAPI spec, got %s", rec.Body.String())
	}
}

func TestSessionPaymentAndGalleryFlow(t *testing.T) {
	handler := newTestServer(t)
	adminToken := loginAdmin(t, handler)

	sessionBody := bytes.NewBufferString(`{"layoutId":"layout-3","paperSize":"4r","frameId":"demo-frame"}`)
	sessionReq := httptest.NewRequest(http.MethodPost, "/api/sessions", sessionBody)
	sessionReq.Header.Set("content-type", "application/json")
	sessionRec := httptest.NewRecorder()
	handler.ServeHTTP(sessionRec, sessionReq)

	if sessionRec.Code != http.StatusCreated {
		t.Fatalf("expected session status 201, got %d: %s", sessionRec.Code, sessionRec.Body.String())
	}

	var sessionResponse struct {
		Data struct {
			ID            string `json:"id"`
			CustomerToken string `json:"customerToken"`
		} `json:"data"`
	}
	if err := json.Unmarshal(sessionRec.Body.Bytes(), &sessionResponse); err != nil {
		t.Fatalf("decode session response: %v", err)
	}
	if sessionResponse.Data.ID == "" {
		t.Fatal("expected session id")
	}
	if sessionResponse.Data.CustomerToken == "" {
		t.Fatal("expected customer session token")
	}
	if bytes.Contains(sessionRec.Body.Bytes(), []byte("customerTokenHash")) {
		t.Fatal("customer token hash leaked in create session response")
	}

	unauthorizedPaymentBody := bytes.NewBufferString(`{"sessionId":"` + sessionResponse.Data.ID + `","provider":"manual","amount":50000}`)
	unauthorizedPaymentReq := httptest.NewRequest(http.MethodPost, "/api/payments", unauthorizedPaymentBody)
	unauthorizedPaymentReq.Header.Set("content-type", "application/json")
	unauthorizedPaymentRec := httptest.NewRecorder()
	handler.ServeHTTP(unauthorizedPaymentRec, unauthorizedPaymentReq)
	if unauthorizedPaymentRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected payment without customer token status 401, got %d: %s", unauthorizedPaymentRec.Code, unauthorizedPaymentRec.Body.String())
	}

	paymentBody := bytes.NewBufferString(`{"sessionId":"` + sessionResponse.Data.ID + `","provider":"manual","amount":50000}`)
	paymentReq := httptest.NewRequest(http.MethodPost, "/api/payments", paymentBody)
	paymentReq.Header.Set("content-type", "application/json")
	paymentReq.Header.Set("x-session-token", sessionResponse.Data.CustomerToken)
	paymentRec := httptest.NewRecorder()
	handler.ServeHTTP(paymentRec, paymentReq)

	if paymentRec.Code != http.StatusCreated {
		t.Fatalf("expected payment status 201, got %d: %s", paymentRec.Code, paymentRec.Body.String())
	}
	var paymentResponse struct {
		Data struct {
			ID     string `json:"id"`
			Status string `json:"status"`
		} `json:"data"`
	}
	if err := json.Unmarshal(paymentRec.Body.Bytes(), &paymentResponse); err != nil {
		t.Fatalf("decode payment response: %v", err)
	}
	if paymentResponse.Data.Status != "pending" {
		t.Fatalf("expected manual payment to stay pending, got %q", paymentResponse.Data.Status)
	}

	simPaymentBody := bytes.NewBufferString(`{"sessionId":"` + sessionResponse.Data.ID + `","provider":"qris-simulation","amount":50000}`)
	simPaymentReq := httptest.NewRequest(http.MethodPost, "/api/payments", simPaymentBody)
	simPaymentReq.Header.Set("content-type", "application/json")
	simPaymentReq.Header.Set("x-session-token", sessionResponse.Data.CustomerToken)
	simPaymentRec := httptest.NewRecorder()
	handler.ServeHTTP(simPaymentRec, simPaymentReq)

	if simPaymentRec.Code != http.StatusCreated {
		t.Fatalf("expected simulated payment status 201, got %d: %s", simPaymentRec.Code, simPaymentRec.Body.String())
	}
	var simPaymentResponse struct {
		Data struct {
			Status string `json:"status"`
		} `json:"data"`
	}
	if err := json.Unmarshal(simPaymentRec.Body.Bytes(), &simPaymentResponse); err != nil {
		t.Fatalf("decode simulated payment response: %v", err)
	}
	if simPaymentResponse.Data.Status != "paid" {
		t.Fatalf("expected qris simulation payment to be paid, got %q", simPaymentResponse.Data.Status)
	}

	finalizeBody := bytes.NewBufferString(`{"finalImage":"` + tinyPNGDataURL + `","animatedImage":"` + tinyGIFDataURL + `","images":["` + tinyPNGDataURL + `"]}`)
	finalizeReq := httptest.NewRequest(http.MethodPost, "/api/sessions/"+sessionResponse.Data.ID+"/finalize", finalizeBody)
	finalizeReq.Header.Set("content-type", "application/json")
	finalizeReq.Header.Set("x-session-token", sessionResponse.Data.CustomerToken)
	finalizeRec := httptest.NewRecorder()
	handler.ServeHTTP(finalizeRec, finalizeReq)

	if finalizeRec.Code != http.StatusOK {
		t.Fatalf("expected finalize status 200, got %d: %s", finalizeRec.Code, finalizeRec.Body.String())
	}

	galleryReq := httptest.NewRequest(http.MethodGet, "/api/galleries/"+sessionResponse.Data.ID, nil)
	galleryRec := httptest.NewRecorder()
	handler.ServeHTTP(galleryRec, galleryReq)

	if galleryRec.Code != http.StatusOK {
		t.Fatalf("expected gallery status 200, got %d: %s", galleryRec.Code, galleryRec.Body.String())
	}
	if !bytes.Contains(galleryRec.Body.Bytes(), []byte("animatedImage")) || !bytes.Contains(galleryRec.Body.Bytes(), []byte("featured-video.gif")) {
		t.Fatalf("expected gallery animated image, got %s", galleryRec.Body.String())
	}

	sendBody := bytes.NewBufferString(`{"channel":"email","recipient":"user@example.test"}`)
	sendReq := httptest.NewRequest(http.MethodPost, "/api/sessions/"+sessionResponse.Data.ID+"/send-link", sendBody)
	sendReq.Header.Set("content-type", "application/json")
	sendReq.Header.Set("x-session-token", sessionResponse.Data.CustomerToken)
	sendRec := httptest.NewRecorder()
	handler.ServeHTTP(sendRec, sendReq)

	if sendRec.Code != http.StatusAccepted {
		t.Fatalf("expected send-link status 202, got %d: %s", sendRec.Code, sendRec.Body.String())
	}

	auditReq := httptest.NewRequest(http.MethodGet, "/api/admin/audit-logs?pageSize=100", nil)
	auditReq.Header.Set("authorization", "Bearer "+adminToken)
	auditRec := httptest.NewRecorder()
	handler.ServeHTTP(auditRec, auditReq)
	if auditRec.Code != http.StatusOK {
		t.Fatalf("expected audit logs status 200, got %d: %s", auditRec.Code, auditRec.Body.String())
	}
	for _, action := range []string{
		"customer.session.create",
		"customer.session.finalize",
		"customer.session.send_link",
		"customer.payment.create",
	} {
		if !bytes.Contains(auditRec.Body.Bytes(), []byte(action)) {
			t.Fatalf("expected audit log action %q in %s", action, auditRec.Body.String())
		}
	}

	for _, path := range []string{
		"/api/admin/stats",
		"/api/admin/messages",
		"/api/admin/payments",
		"/api/admin/payment-logs",
		"/api/admin/payment-logs?paymentId=" + paymentResponse.Data.ID,
		"/api/admin/transactions",
		"/api/admin/audit-logs",
		"/api/admin/sessions/" + sessionResponse.Data.ID,
	} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("authorization", "Bearer "+adminToken)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected %s status 200, got %d: %s", path, rec.Code, rec.Body.String())
		}
	}
}

func TestExpiredGalleryBlocksAPIAndFiles(t *testing.T) {
	handler := newTestServer(t)

	sessionReq := httptest.NewRequest(http.MethodPost, "/api/sessions", bytes.NewBufferString(`{"layoutId":"layout-3"}`))
	sessionReq.Header.Set("content-type", "application/json")
	sessionRec := httptest.NewRecorder()
	handler.ServeHTTP(sessionRec, sessionReq)
	if sessionRec.Code != http.StatusCreated {
		t.Fatalf("expected session status 201, got %d: %s", sessionRec.Code, sessionRec.Body.String())
	}

	var sessionResponse struct {
		Data struct {
			ID            string `json:"id"`
			CustomerToken string `json:"customerToken"`
		} `json:"data"`
	}
	if err := json.Unmarshal(sessionRec.Body.Bytes(), &sessionResponse); err != nil {
		t.Fatalf("decode session response: %v", err)
	}

	finalizeReq := httptest.NewRequest(http.MethodPost, "/api/sessions/"+sessionResponse.Data.ID+"/finalize", bytes.NewBufferString(`{"finalImage":"`+tinyPNGDataURL+`","images":["`+tinyPNGDataURL+`"]}`))
	finalizeReq.Header.Set("content-type", "application/json")
	finalizeReq.Header.Set("x-session-token", sessionResponse.Data.CustomerToken)
	finalizeRec := httptest.NewRecorder()
	handler.ServeHTTP(finalizeRec, finalizeReq)
	if finalizeRec.Code != http.StatusOK {
		t.Fatalf("expected finalize status 200, got %d: %s", finalizeRec.Code, finalizeRec.Body.String())
	}

	var galleryResponse struct {
		Data struct {
			FinalImage *models.StoredImage `json:"finalImage"`
			Images     []string            `json:"images"`
		} `json:"data"`
	}
	galleryReq := httptest.NewRequest(http.MethodGet, "/api/galleries/"+sessionResponse.Data.ID, nil)
	galleryRec := httptest.NewRecorder()
	handler.ServeHTTP(galleryRec, galleryReq)
	if galleryRec.Code != http.StatusOK {
		t.Fatalf("expected gallery status 200, got %d: %s", galleryRec.Code, galleryRec.Body.String())
	}
	if err := json.Unmarshal(galleryRec.Body.Bytes(), &galleryResponse); err != nil {
		t.Fatalf("decode gallery response: %v", err)
	}
	if galleryResponse.Data.FinalImage == nil || galleryResponse.Data.FinalImage.URL == "" {
		t.Fatalf("expected final image url in gallery response: %s", galleryRec.Body.String())
	}

	filePath := strings.TrimPrefix(galleryResponse.Data.FinalImage.URL, "http://example.test")
	fileReq := httptest.NewRequest(http.MethodGet, filePath, nil)
	fileRec := httptest.NewRecorder()
	handler.ServeHTTP(fileRec, fileReq)
	if fileRec.Code != http.StatusOK {
		t.Fatalf("expected file status 200 before expiry, got %d: %s", fileRec.Code, fileRec.Body.String())
	}

	expireReq := httptest.NewRequest(http.MethodPost, "/api/sessions/"+sessionResponse.Data.ID+"/expire", nil)
	expireReq.Header.Set("x-session-token", sessionResponse.Data.CustomerToken)
	expireRec := httptest.NewRecorder()
	handler.ServeHTTP(expireRec, expireReq)
	if expireRec.Code != http.StatusOK {
		t.Fatalf("expected expire status 200, got %d: %s", expireRec.Code, expireRec.Body.String())
	}

	expiredGalleryReq := httptest.NewRequest(http.MethodGet, "/api/galleries/"+sessionResponse.Data.ID, nil)
	expiredGalleryRec := httptest.NewRecorder()
	handler.ServeHTTP(expiredGalleryRec, expiredGalleryReq)
	if expiredGalleryRec.Code != http.StatusGone {
		t.Fatalf("expected expired gallery status 410, got %d: %s", expiredGalleryRec.Code, expiredGalleryRec.Body.String())
	}

	expiredFileReq := httptest.NewRequest(http.MethodGet, filePath, nil)
	expiredFileRec := httptest.NewRecorder()
	handler.ServeHTTP(expiredFileRec, expiredFileReq)
	if expiredFileRec.Code != http.StatusGone {
		t.Fatalf("expected expired file status 410, got %d: %s", expiredFileRec.Code, expiredFileRec.Body.String())
	}
}

func TestFinalizeRejectsInvalidPhotoData(t *testing.T) {
	handler := newTestServer(t)

	sessionReq := httptest.NewRequest(http.MethodPost, "/api/sessions", bytes.NewBufferString(`{"layoutId":"layout-3"}`))
	sessionReq.Header.Set("content-type", "application/json")
	sessionRec := httptest.NewRecorder()
	handler.ServeHTTP(sessionRec, sessionReq)
	if sessionRec.Code != http.StatusCreated {
		t.Fatalf("expected session status 201, got %d: %s", sessionRec.Code, sessionRec.Body.String())
	}

	var sessionResponse struct {
		Data struct {
			ID            string `json:"id"`
			CustomerToken string `json:"customerToken"`
		} `json:"data"`
	}
	if err := json.Unmarshal(sessionRec.Body.Bytes(), &sessionResponse); err != nil {
		t.Fatalf("decode session response: %v", err)
	}

	finalizeReq := httptest.NewRequest(http.MethodPost, "/api/sessions/"+sessionResponse.Data.ID+"/finalize", bytes.NewBufferString(`{"finalImage":"data:image/png;base64,aGVsbG8="}`))
	finalizeReq.Header.Set("content-type", "application/json")
	finalizeReq.Header.Set("x-session-token", sessionResponse.Data.CustomerToken)
	finalizeRec := httptest.NewRecorder()
	handler.ServeHTTP(finalizeRec, finalizeReq)

	if finalizeRec.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid photo status 400, got %d: %s", finalizeRec.Code, finalizeRec.Body.String())
	}
}

func TestFinalizeKeepsValidPhotosWhenSomeImagesAreInvalid(t *testing.T) {
	handler := newTestServer(t)

	sessionReq := httptest.NewRequest(http.MethodPost, "/api/sessions", bytes.NewBufferString(`{"layoutId":"layout-3"}`))
	sessionReq.Header.Set("content-type", "application/json")
	sessionRec := httptest.NewRecorder()
	handler.ServeHTTP(sessionRec, sessionReq)
	if sessionRec.Code != http.StatusCreated {
		t.Fatalf("expected session status 201, got %d: %s", sessionRec.Code, sessionRec.Body.String())
	}

	var sessionResponse struct {
		Data struct {
			ID            string `json:"id"`
			CustomerToken string `json:"customerToken"`
		} `json:"data"`
	}
	if err := json.Unmarshal(sessionRec.Body.Bytes(), &sessionResponse); err != nil {
		t.Fatalf("decode session response: %v", err)
	}

	body := bytes.NewBufferString(`{"finalImage":"data:image/png;base64,aGVsbG8=","images":["` + tinyPNGDataURL + `","data:image/png;base64,aGVsbG8="]}`)
	finalizeReq := httptest.NewRequest(http.MethodPost, "/api/sessions/"+sessionResponse.Data.ID+"/finalize", body)
	finalizeReq.Header.Set("content-type", "application/json")
	finalizeReq.Header.Set("x-session-token", sessionResponse.Data.CustomerToken)
	finalizeRec := httptest.NewRecorder()
	handler.ServeHTTP(finalizeRec, finalizeReq)

	if finalizeRec.Code != http.StatusOK {
		t.Fatalf("expected mixed valid/invalid finalize status 200, got %d: %s", finalizeRec.Code, finalizeRec.Body.String())
	}
	if !bytes.Contains(finalizeRec.Body.Bytes(), []byte("image-1.png")) {
		t.Fatalf("expected valid image to be saved, got %s", finalizeRec.Body.String())
	}
}

func TestAdminTokenIsStoredHashed(t *testing.T) {
	handler := newTestServer(t)
	token := loginAdmin(t, handler)

	req := httptest.NewRequest(http.MethodGet, "/api/admin/audit-logs", nil)
	req.Header.Set("authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected audit logs status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if bytes.Contains(rec.Body.Bytes(), []byte(token)) {
		t.Fatal("raw admin token leaked in API response")
	}
}

func TestMonitoringErrorEventIsRecorded(t *testing.T) {
	handler := newTestServer(t)
	adminToken := loginAdmin(t, handler)

	body := bytes.NewBufferString(`{"category":"print","sessionId":"session-test","message":"printer offline","source":"test"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/events/errors", body)
	req.Header.Set("content-type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected error event status 202, got %d: %s", rec.Code, rec.Body.String())
	}

	auditReq := httptest.NewRequest(http.MethodGet, "/api/admin/audit-logs?q=monitoring.error.print", nil)
	auditReq.Header.Set("authorization", "Bearer "+adminToken)
	auditRec := httptest.NewRecorder()
	handler.ServeHTTP(auditRec, auditReq)
	if auditRec.Code != http.StatusOK {
		t.Fatalf("expected audit logs status 200, got %d: %s", auditRec.Code, auditRec.Body.String())
	}
	if !bytes.Contains(auditRec.Body.Bytes(), []byte("monitoring.error.print")) || !bytes.Contains(auditRec.Body.Bytes(), []byte("printer offline")) {
		t.Fatalf("expected monitoring error audit log, got %s", auditRec.Body.String())
	}
}

func TestStaffCanAccessOperationalReportsOnly(t *testing.T) {
	handler := newTestServer(t)
	staffToken := createAndLoginStaff(t, handler)

	for _, path := range []string{
		"/api/admin/sessions",
		"/api/admin/transactions",
		"/api/admin/payment-logs",
		"/api/admin/messages",
		"/api/admin/payments",
	} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("authorization", "Bearer "+staffToken)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected staff access %s status 200, got %d: %s", path, rec.Code, rec.Body.String())
		}
	}

	monitoringBody := bytes.NewBufferString(`{"category":"print","sessionId":"staff-session","message":"staff visible error","source":"test"}`)
	monitoringReq := httptest.NewRequest(http.MethodPost, "/api/events/errors", monitoringBody)
	monitoringReq.Header.Set("content-type", "application/json")
	monitoringRec := httptest.NewRecorder()
	handler.ServeHTTP(monitoringRec, monitoringReq)
	if monitoringRec.Code != http.StatusAccepted {
		t.Fatalf("expected monitoring event status 202, got %d: %s", monitoringRec.Code, monitoringRec.Body.String())
	}

	auditReq := httptest.NewRequest(http.MethodGet, "/api/admin/audit-logs?pageSize=100", nil)
	auditReq.Header.Set("authorization", "Bearer "+staffToken)
	auditRec := httptest.NewRecorder()
	handler.ServeHTTP(auditRec, auditReq)
	if auditRec.Code != http.StatusOK {
		t.Fatalf("expected staff audit logs status 200, got %d: %s", auditRec.Code, auditRec.Body.String())
	}
	if !bytes.Contains(auditRec.Body.Bytes(), []byte("monitoring.error.print")) {
		t.Fatalf("expected staff audit response to include monitoring error, got %s", auditRec.Body.String())
	}
	if bytes.Contains(auditRec.Body.Bytes(), []byte("admin.login.success")) || bytes.Contains(auditRec.Body.Bytes(), []byte("admin.user.create")) {
		t.Fatalf("expected staff audit response to hide full audit logs, got %s", auditRec.Body.String())
	}

	for _, path := range []string{
		"/api/admin/users",
		"/api/admin/storage",
	} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("authorization", "Bearer "+staffToken)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected staff denied %s status 401, got %d: %s", path, rec.Code, rec.Body.String())
		}
	}
}

func TestAdminLogoutRevokesToken(t *testing.T) {
	handler := newTestServer(t)
	token := loginAdmin(t, handler)

	logoutReq := httptest.NewRequest(http.MethodPost, "/api/admin/auth/logout", nil)
	logoutReq.Header.Set("authorization", "Bearer "+token)
	logoutRec := httptest.NewRecorder()
	handler.ServeHTTP(logoutRec, logoutReq)

	if logoutRec.Code != http.StatusOK {
		t.Fatalf("expected logout status 200, got %d: %s", logoutRec.Code, logoutRec.Body.String())
	}

	meReq := httptest.NewRequest(http.MethodGet, "/api/admin/auth/me", nil)
	meReq.Header.Set("authorization", "Bearer "+token)
	meRec := httptest.NewRecorder()
	handler.ServeHTTP(meRec, meReq)

	if meRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected revoked token status 401, got %d: %s", meRec.Code, meRec.Body.String())
	}
}

func TestAdminUserManagement(t *testing.T) {
	handler := newTestServer(t)
	token := loginAdmin(t, handler)

	createReq := httptest.NewRequest(http.MethodPost, "/api/admin/users", bytes.NewBufferString(`{"email":"staff@example.test","password":"staff-password-123","role":"staff"}`))
	createReq.Header.Set("content-type", "application/json")
	createReq.Header.Set("authorization", "Bearer "+token)
	createRec := httptest.NewRecorder()
	handler.ServeHTTP(createRec, createReq)

	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected create admin user status 201, got %d: %s", createRec.Code, createRec.Body.String())
	}
	if bytes.Contains(createRec.Body.Bytes(), []byte("passwordHash")) {
		t.Fatal("admin password hash leaked in API response")
	}

	var createResponse struct {
		Data struct {
			ID    string `json:"id"`
			Email string `json:"email"`
			Role  string `json:"role"`
		} `json:"data"`
	}
	if err := json.Unmarshal(createRec.Body.Bytes(), &createResponse); err != nil {
		t.Fatalf("decode create admin response: %v", err)
	}
	if createResponse.Data.ID == "" || createResponse.Data.Email != "staff@example.test" || createResponse.Data.Role != "staff" {
		t.Fatalf("unexpected create admin response: %s", createRec.Body.String())
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	listReq.Header.Set("authorization", "Bearer "+token)
	listRec := httptest.NewRecorder()
	handler.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected list admin users status 200, got %d: %s", listRec.Code, listRec.Body.String())
	}

	updateReq := httptest.NewRequest(http.MethodPatch, "/api/admin/users/"+createResponse.Data.ID, bytes.NewBufferString(`{"role":"owner","password":"new-staff-password-123"}`))
	updateReq.Header.Set("content-type", "application/json")
	updateReq.Header.Set("authorization", "Bearer "+token)
	updateRec := httptest.NewRecorder()
	handler.ServeHTTP(updateRec, updateReq)
	if updateRec.Code != http.StatusOK {
		t.Fatalf("expected update admin user status 200, got %d: %s", updateRec.Code, updateRec.Body.String())
	}

	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/admin/users/"+createResponse.Data.ID, nil)
	deleteReq.Header.Set("authorization", "Bearer "+token)
	deleteRec := httptest.NewRecorder()
	handler.ServeHTTP(deleteRec, deleteReq)
	if deleteRec.Code != http.StatusNoContent {
		t.Fatalf("expected delete admin user status 204, got %d: %s", deleteRec.Code, deleteRec.Body.String())
	}
}

func TestAdminVoucherManagement(t *testing.T) {
	handler := newTestServer(t)
	token := loginAdmin(t, handler)

	createReq := httptest.NewRequest(http.MethodPost, "/api/admin/vouchers", bytes.NewBufferString(`{"code":"event10","name":"Event Discount","type":"percent","value":10,"minAmount":50000,"maxDiscount":15000,"usageLimit":25,"active":true}`))
	createReq.Header.Set("content-type", "application/json")
	createReq.Header.Set("authorization", "Bearer "+token)
	createRec := httptest.NewRecorder()
	handler.ServeHTTP(createRec, createReq)

	if createRec.Code != http.StatusOK {
		t.Fatalf("expected create voucher status 200, got %d: %s", createRec.Code, createRec.Body.String())
	}

	var createResponse struct {
		Data models.Voucher `json:"data"`
	}
	if err := json.Unmarshal(createRec.Body.Bytes(), &createResponse); err != nil {
		t.Fatalf("decode create voucher response: %v", err)
	}
	if createResponse.Data.ID == "" || createResponse.Data.Code != "EVENT10" || createResponse.Data.Type != "percent" {
		t.Fatalf("unexpected create voucher response: %s", createRec.Body.String())
	}

	duplicateReq := httptest.NewRequest(http.MethodPost, "/api/admin/vouchers", bytes.NewBufferString(`{"code":"EVENT10","name":"Duplicate","type":"fixed","value":5000}`))
	duplicateReq.Header.Set("content-type", "application/json")
	duplicateReq.Header.Set("authorization", "Bearer "+token)
	duplicateRec := httptest.NewRecorder()
	handler.ServeHTTP(duplicateRec, duplicateReq)
	if duplicateRec.Code != http.StatusConflict {
		t.Fatalf("expected duplicate voucher status 409, got %d: %s", duplicateRec.Code, duplicateRec.Body.String())
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/admin/vouchers", nil)
	listReq.Header.Set("authorization", "Bearer "+token)
	listRec := httptest.NewRecorder()
	handler.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK || !bytes.Contains(listRec.Body.Bytes(), []byte("EVENT10")) {
		t.Fatalf("expected list vouchers to include EVENT10, got %d: %s", listRec.Code, listRec.Body.String())
	}

	updateReq := httptest.NewRequest(http.MethodPut, "/api/admin/vouchers/"+createResponse.Data.ID, bytes.NewBufferString(`{"code":"EVENT10","name":"Event Discount Updated","type":"fixed","value":7000,"active":false}`))
	updateReq.Header.Set("content-type", "application/json")
	updateReq.Header.Set("authorization", "Bearer "+token)
	updateRec := httptest.NewRecorder()
	handler.ServeHTTP(updateRec, updateReq)
	if updateRec.Code != http.StatusOK || !bytes.Contains(updateRec.Body.Bytes(), []byte(`"active":false`)) {
		t.Fatalf("expected update voucher status 200 with inactive voucher, got %d: %s", updateRec.Code, updateRec.Body.String())
	}

	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/admin/vouchers/"+createResponse.Data.ID, nil)
	deleteReq.Header.Set("authorization", "Bearer "+token)
	deleteRec := httptest.NewRecorder()
	handler.ServeHTTP(deleteRec, deleteReq)
	if deleteRec.Code != http.StatusNoContent {
		t.Fatalf("expected delete voucher status 204, got %d: %s", deleteRec.Code, deleteRec.Body.String())
	}
}

func TestSecurityValidation(t *testing.T) {
	handler := newTestServer(t)

	loginReq := httptest.NewRequest(http.MethodPost, "/api/admin/auth/login", bytes.NewBufferString(`{"email":"admin@example.test","password":"wrong-password"}`))
	loginReq.Header.Set("content-type", "application/json")
	loginRec := httptest.NewRecorder()
	handler.ServeHTTP(loginRec, loginReq)
	if loginRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected bad login status 401, got %d: %s", loginRec.Code, loginRec.Body.String())
	}

	sessionReq := httptest.NewRequest(http.MethodPost, "/api/sessions", bytes.NewBufferString(`{"layoutId":"layout-3"}`))
	sessionReq.Header.Set("content-type", "application/json")
	sessionRec := httptest.NewRecorder()
	handler.ServeHTTP(sessionRec, sessionReq)
	if sessionRec.Code != http.StatusCreated {
		t.Fatalf("expected session status 201, got %d: %s", sessionRec.Code, sessionRec.Body.String())
	}

	var sessionResponse struct {
		Data struct {
			ID            string `json:"id"`
			CustomerToken string `json:"customerToken"`
		} `json:"data"`
	}
	if err := json.Unmarshal(sessionRec.Body.Bytes(), &sessionResponse); err != nil {
		t.Fatalf("decode session response: %v", err)
	}

	sendReq := httptest.NewRequest(http.MethodPost, "/api/sessions/"+sessionResponse.Data.ID+"/send-link", bytes.NewBufferString(`{"channel":"email","recipient":"not-an-email"}`))
	sendReq.Header.Set("content-type", "application/json")
	sendReq.Header.Set("x-session-token", sessionResponse.Data.CustomerToken)
	sendRec := httptest.NewRecorder()
	handler.ServeHTTP(sendRec, sendReq)
	if sendRec.Code != http.StatusBadRequest {
		t.Fatalf("expected bad email status 400, got %d: %s", sendRec.Code, sendRec.Body.String())
	}

	paymentReq := httptest.NewRequest(http.MethodPost, "/api/payments", bytes.NewBufferString(`{"sessionId":"`+sessionResponse.Data.ID+`","provider":"manual","amount":0}`))
	paymentReq.Header.Set("content-type", "application/json")
	paymentRec := httptest.NewRecorder()
	handler.ServeHTTP(paymentRec, paymentReq)
	if paymentRec.Code != http.StatusBadRequest {
		t.Fatalf("expected bad payment status 400, got %d: %s", paymentRec.Code, paymentRec.Body.String())
	}
}
