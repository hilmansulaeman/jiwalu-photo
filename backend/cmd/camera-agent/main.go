// Camera Agent is a small companion service for a Windows computer physically
// connected to a DSLR. It deliberately has no dependency on the main web app:
// copy camera-agent.exe and camera-agent.env to the booth computer, then point
// the Vercel dashboard at this service through a secure tunnel.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

type config struct {
	Listen             string
	AllowedOrigins     map[string]bool
	Provider           string
	GPhotoPath         string
	DigiCamControlURL  string
	SupabaseURL        string
	SupabaseServiceKey string
	SupabaseBucket     string
	CaptureDirectory   string
	StorageMode        string
}

type response struct {
	Data  any       `json:"data,omitempty"`
	Error *apiError `json:"error,omitempty"`
}

type apiError struct {
	Message string `json:"message"`
}

type camera struct {
	Model string `json:"model"`
	// Port is the ID saved by the booth. For cameras exposing a serial number it
	// is canon:<serial>, not the temporary usb:BUS,DEVICE location.
	Port    string `json:"port"`
	USBPort string `json:"usbPort,omitempty"`
	Stable  bool   `json:"stable"`
}

type captureRequest struct {
	Port string `json:"port"`
}

// localCapture is intentionally compatible with the existing local Hardware
// Agent contract. The web app can therefore use this gphoto2/WinUSB bridge
// without talking to the cloud backend for a USB device.
type localCapture struct {
	CameraID  string `json:"cameraId"`
	FileName  string `json:"fileName"`
	LocalPath string `json:"localPath"`
	URL       string `json:"url"`
}

var gphotoMu sync.Mutex

func main() {
	cfg, err := loadConfig()
	if err != nil {
		log.Fatal(err)
	}

	if cfg.Provider == "gphoto2" {
		if _, err := exec.LookPath(cfg.GPhotoPath); err != nil {
			log.Fatalf("gphoto2 tidak ditemukan (%s). Install MSYS2 gphoto2 atau isi GPHOTO2_PATH: %v", cfg.GPhotoPath, err)
		}
	}
	if cfg.Provider != "gphoto2" && cfg.Provider != "digicamcontrol" {
		log.Fatalf("CAMERA_PROVIDER tidak valid: %s", cfg.Provider)
	}
	if cfg.StorageMode == "supabase" && (cfg.SupabaseURL == "" || cfg.SupabaseServiceKey == "") {
		log.Fatal("SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi bila CAMERA_AGENT_STORAGE=supabase")
	}

	agent := &agent{cfg: cfg, client: &http.Client{Timeout: 45 * time.Second}}
	server := &http.Server{
		Addr:              cfg.Listen,
		Handler:           agent.withCORS(agent.routes()),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("Camera Agent berjalan di http://%s", cfg.Listen)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

type agent struct {
	cfg    config
	client *http.Client
}

func (a *agent) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, response{Data: map[string]string{"status": "ok"}})
	})
	mux.HandleFunc("/api/dslr/cameras", a.handleCameras)
	mux.HandleFunc("/api/dslr/capture", a.handleCapture)
	// Local endpoints are used by photo-box in phase 1. Keep the legacy DSLR
	// endpoints above so existing deployments do not break during migration.
	mux.HandleFunc("/api/cameras", a.handleLocalCameras)
	mux.HandleFunc("/api/cameras/", a.handleLocalCamera)
	mux.HandleFunc("/api/captures/", a.handleLocalCapture)
	mux.HandleFunc("/api/printers", a.handlePrinters)
	mux.HandleFunc("/api/prints", a.handlePrints)
	return mux
}

func (a *agent) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && a.cfg.AllowedOrigins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		// A public HTTPS dashboard calling a loopback bridge triggers Chrome's
		// Private Network Access preflight.
		if strings.EqualFold(r.Header.Get("Access-Control-Request-Private-Network"), "true") {
			w.Header().Set("Access-Control-Allow-Private-Network", "true")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *agent) handleCameras(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	cameras, err := a.detect(r.Context())
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, response{Data: cameras})
}

func (a *agent) handleCapture(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	defer r.Body.Close()
	var body captureRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 8*1024)).Decode(&body); err != nil || !a.validCameraID(strings.TrimSpace(body.Port)) {
		writeError(w, http.StatusBadRequest, "DSLR port is required.")
		return
	}
	imageURL, err := a.capture(r.Context(), strings.TrimSpace(body.Port), requestBaseURL(r))
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, response{Data: map[string]string{"url": imageURL}})
}

func (a *agent) handleLocalCameras(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	cameras, err := a.detect(r.Context())
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, response{Data: cameras})
}

func (a *agent) handleLocalCamera(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost || !strings.HasSuffix(r.URL.Path, "/capture") {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	encodedID := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/cameras/"), "/capture")
	port, err := url.PathUnescape(encodedID)
	if err != nil || !a.validCameraID(port) {
		writeError(w, http.StatusBadRequest, "DSLR camera ID is invalid.")
		return
	}
	result, err := a.captureLocal(r.Context(), port, requestBaseURL(r))
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, response{Data: result})
}

func (a *agent) handleLocalCapture(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	name, err := url.PathUnescape(strings.TrimPrefix(r.URL.Path, "/api/captures/"))
	if err != nil || name == "" || filepath.Base(name) != name {
		writeError(w, http.StatusBadRequest, "Capture file is invalid.")
		return
	}
	path := filepath.Join(a.cfg.CaptureDirectory, name)
	if _, err := os.Stat(path); err != nil {
		writeError(w, http.StatusNotFound, "Capture file not found.")
		return
	}
	http.ServeFile(w, r, path)
}

func (a *agent) detect(parent context.Context) ([]camera, error) {
	if a.cfg.Provider == "digicamcontrol" {
		return a.detectDigiCamControl(parent)
	}
	return a.detectGPhoto(parent)
}

func (a *agent) validCameraID(port string) bool {
	if a.cfg.Provider == "digicamcontrol" {
		return strings.HasPrefix(port, "dcc:")
	}
	return isUSBPort(port) || strings.HasPrefix(port, "canon:")
}

func isUSBPort(port string) bool { return strings.HasPrefix(port, "usb:") }

func (a *agent) detectGPhoto(parent context.Context) ([]camera, error) {
	gphotoMu.Lock()
	defer gphotoMu.Unlock()
	ctx, cancel := context.WithTimeout(parent, 30*time.Second)
	defer cancel()
	return a.detectGPhotoLocked(ctx)
}

func (a *agent) detectGPhotoLocked(ctx context.Context) ([]camera, error) {
	output, err := exec.CommandContext(ctx, a.cfg.GPhotoPath, "--auto-detect").CombinedOutput()
	if err != nil {
		return nil, gphotoError(err, output)
	}
	var cameras []camera
	for _, line := range strings.Split(string(output), "\n") {
		line = strings.TrimSpace(line)
		fields := strings.Fields(line)
		if len(fields) < 2 || !strings.HasPrefix(fields[len(fields)-1], "usb:") {
			continue
		}
		usbPort := fields[len(fields)-1]
		model := strings.TrimSpace(strings.TrimSuffix(line, usbPort))
		serial := a.gphotoSerial(ctx, usbPort)
		cameras = append(cameras, newGPhotoCamera(model, usbPort, serial))
	}
	return cameras, nil
}

func (a *agent) gphotoSerial(ctx context.Context, usbPort string) string {
	// --summary is supported across more libgphoto2 camera drivers than a
	// particular config key. Failure is deliberately non-fatal: a camera can
	// still be used, but is marked non-permanent in the picker.
	output, err := exec.CommandContext(ctx, a.cfg.GPhotoPath, "--port", usbPort, "--summary").CombinedOutput()
	if err != nil {
		return ""
	}
	return serialFromSummary(string(output))
}

var serialLine = regexp.MustCompile(`(?im)^\s*(?:serial(?:\s+number)?)\s*:\s*(.+?)\s*$`)

func serialFromSummary(summary string) string {
	match := serialLine.FindStringSubmatch(summary)
	if len(match) != 2 {
		return ""
	}
	serial := strings.TrimSpace(match[1])
	if serial == "" || strings.EqualFold(serial, "unknown") || strings.EqualFold(serial, "n/a") {
		return ""
	}
	return serial
}

func newGPhotoCamera(model, usbPort, serial string) camera {
	if serial == "" {
		return camera{Model: model, Port: usbPort, USBPort: usbPort, Stable: false}
	}
	return camera{Model: model, Port: "canon:" + serial, USBPort: usbPort, Stable: true}
}

func (a *agent) resolveGPhotoPort(parent context.Context, cameraID string) (string, error) {
	if isUSBPort(cameraID) {
		return cameraID, nil // Compatibility for an old saved single-camera setting.
	}
	if !strings.HasPrefix(cameraID, "canon:") {
		return "", errors.New("DSLR camera ID is invalid")
	}
	cameras, err := a.detectGPhoto(parent)
	if err != nil {
		return "", err
	}
	for _, item := range cameras {
		if item.Port == cameraID && item.Stable {
			return item.USBPort, nil
		}
	}
	return "", fmt.Errorf("Canon dengan ID %q tidak terdeteksi. Periksa kabel, daya, atau Zadig/WinUSB", strings.TrimPrefix(cameraID, "canon:"))
}

func (a *agent) capture(parent context.Context, port, baseURL string) (string, error) {
	if a.cfg.Provider == "digicamcontrol" {
		return a.captureDigiCamControl(parent, port)
	}
	result, err := a.captureLocal(parent, port, baseURL)
	if err != nil {
		return "", err
	}
	return result.URL, nil
}

func (a *agent) captureLocal(parent context.Context, port, baseURL string) (localCapture, error) {
	if a.cfg.Provider != "gphoto2" {
		return localCapture{}, errors.New("mode local hanya tersedia untuk CAMERA_PROVIDER=gphoto2")
	}
	if strings.ContainsAny(port, "\r\n") || !a.validCameraID(port) {
		return localCapture{}, errors.New("DSLR port is invalid")
	}
	usbPort, err := a.resolveGPhotoPort(parent, port)
	if err != nil {
		return localCapture{}, err
	}
	gphotoMu.Lock()
	defer gphotoMu.Unlock()
	if err := os.MkdirAll(a.cfg.CaptureDirectory, 0755); err != nil {
		return localCapture{}, fmt.Errorf("prepare capture directory: %w", err)
	}
	cleanupCaptures(a.cfg.CaptureDirectory, time.Now().Add(-24*time.Hour))
	name := fmt.Sprintf("dslr-%d.jpg", time.Now().UnixNano())
	path := filepath.Join(a.cfg.CaptureDirectory, name)
	ctx, cancel := context.WithTimeout(parent, 45*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, a.cfg.GPhotoPath, "--port", usbPort, "--capture-image-and-download", "--force-overwrite", "--filename", path).CombinedOutput()
	if err != nil {
		return localCapture{}, gphotoError(err, output)
	}
	info, err := os.Stat(path)
	if err != nil || info.Size() == 0 {
		return localCapture{}, errors.New("DSLR did not return an image")
	}
	if a.cfg.StorageMode == "supabase" {
		content, err := os.ReadFile(path)
		if err != nil {
			return localCapture{}, fmt.Errorf("read DSLR image: %w", err)
		}
		imageURL, err := a.upload("tether/"+name, "image/jpeg", content)
		if err != nil {
			return localCapture{}, err
		}
		return localCapture{CameraID: port, FileName: name, LocalPath: path, URL: imageURL}, nil
	}
	return localCapture{CameraID: port, FileName: name, LocalPath: path, URL: strings.TrimRight(baseURL, "/") + "/api/captures/" + url.PathEscape(name)}, nil
}

func (a *agent) detectDigiCamControl(ctx context.Context) ([]camera, error) {
	output, err := a.dccCommand(ctx, url.Values{"slc": {"list"}, "param1": {"cameras"}, "param2": {""}})
	if err != nil {
		return nil, err
	}
	var cameras []camera
	for _, line := range strings.FieldsFunc(string(output), func(r rune) bool { return r == '\n' || r == '\r' || r == ';' || r == ',' }) {
		name := strings.Trim(strings.TrimSpace(line), `"`)
		if name == "" || strings.EqualFold(name, "ok") || strings.EqualFold(name, "none") {
			continue
		}
		cameras = append(cameras, camera{Model: name, Port: "dcc:" + name})
	}
	return cameras, nil
}

func (a *agent) captureDigiCamControl(parent context.Context, port string) (string, error) {
	cameraName := strings.TrimPrefix(port, "dcc:")
	query := url.Values{"slc": {"capture"}, "param1": {""}, "param2": {""}}
	if cameraName != "" {
		query.Set("camera", cameraName)
	}
	if _, err := a.dccCommand(parent, query); err != nil {
		return "", err
	}

	deadline := time.Now().Add(45 * time.Second)
	for time.Now().Before(deadline) {
		output, err := a.dccCommand(parent, url.Values{"slc": {"get"}, "param1": {"lastcaptured"}, "param2": {""}})
		if err != nil {
			return "", err
		}
		fileName := dccValue(output)
		if fileName != "" && fileName != "-" {
			imageURL := strings.TrimRight(a.cfg.DigiCamControlURL, "/") + "/image/" + url.PathEscape(fileName)
			req, err := http.NewRequestWithContext(parent, http.MethodGet, imageURL, nil)
			if err != nil {
				return "", err
			}
			resp, err := a.client.Do(req)
			if err != nil {
				return "", fmt.Errorf("download foto dari digiCamControl: %w", err)
			}
			content, readErr := io.ReadAll(io.LimitReader(resp.Body, 32*1024*1024))
			resp.Body.Close()
			if readErr != nil {
				return "", readErr
			}
			if resp.StatusCode < 200 || resp.StatusCode >= 300 || len(content) == 0 {
				return "", fmt.Errorf("download foto dari digiCamControl gagal: status %d", resp.StatusCode)
			}
			return a.upload("tether/dcc-"+time.Now().Format("20060102-150405.000000000")+".jpg", "image/jpeg", content)
		}
		select {
		case <-parent.Done():
			return "", parent.Err()
		case <-time.After(500 * time.Millisecond):
		}
	}
	return "", errors.New("digiCamControl tidak mengembalikan foto dalam 45 detik")
}

func (a *agent) dccCommand(ctx context.Context, query url.Values) ([]byte, error) {
	endpoint := strings.TrimRight(a.cfg.DigiCamControlURL, "/") + "/?" + query.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	resp, err := a.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("digiCamControl tidak dapat dihubungi di %s: %w", a.cfg.DigiCamControlURL, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("digiCamControl gagal: status %d", resp.StatusCode)
	}
	return body, nil
}

func dccValue(output []byte) string {
	for _, line := range strings.Split(string(output), "\n") {
		value := strings.Trim(strings.TrimSpace(line), `"`)
		if value != "" && !strings.EqualFold(value, "ok") {
			return value
		}
	}
	return ""
}

func (a *agent) upload(key, mimeType string, content []byte) (string, error) {
	endpoint := strings.TrimRight(a.cfg.SupabaseURL, "/") + "/storage/v1/object/" + url.PathEscape(a.cfg.SupabaseBucket) + "/" + escapeKey(key)
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(content))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+a.cfg.SupabaseServiceKey)
	req.Header.Set("apikey", a.cfg.SupabaseServiceKey)
	req.Header.Set("Content-Type", mimeType)
	req.Header.Set("x-upsert", "true")
	resp, err := a.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("upload to Supabase: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		message, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return "", fmt.Errorf("upload to Supabase failed: status %d: %s", resp.StatusCode, strings.TrimSpace(string(message)))
	}
	return strings.TrimRight(a.cfg.SupabaseURL, "/") + "/storage/v1/object/public/" + url.PathEscape(a.cfg.SupabaseBucket) + "/" + escapeKey(key), nil
}

func loadConfig() (config, error) {
	loadEnvFile()
	allowed := map[string]bool{}
	for _, origin := range strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			allowed[origin] = true
		}
	}
	if len(allowed) == 0 {
		return config{}, errors.New("ALLOWED_ORIGINS wajib diisi dengan URL Vercel dashboard")
	}
	gphotoPath := strings.TrimSpace(os.Getenv("GPHOTO2_PATH"))
	if gphotoPath == "" && runtime.GOOS == "windows" {
		defaultPath := `C:\msys64\ucrt64\bin\gphoto2.exe`
		if _, err := os.Stat(defaultPath); err == nil {
			gphotoPath = defaultPath
		}
	}
	if gphotoPath == "" {
		gphotoPath = "gphoto2"
	}
	captureDir := strings.TrimSpace(os.Getenv("CAMERA_AGENT_CAPTURE_DIR"))
	if captureDir == "" {
		captureDir = filepath.Join(os.TempDir(), "urbanmenphoto-camera-agent")
	}
	return config{
		Listen:             envOr("CAMERA_AGENT_LISTEN", "127.0.0.1:8787"),
		AllowedOrigins:     allowed,
		Provider:           strings.ToLower(envOr("CAMERA_PROVIDER", "gphoto2")),
		GPhotoPath:         gphotoPath,
		DigiCamControlURL:  envOr("DIGICAMCONTROL_URL", "http://127.0.0.1:5513"),
		SupabaseURL:        strings.TrimRight(strings.TrimSpace(os.Getenv("SUPABASE_URL")), "/"),
		SupabaseServiceKey: strings.TrimSpace(os.Getenv("SUPABASE_SERVICE_ROLE_KEY")),
		SupabaseBucket:     envOr("SUPABASE_BUCKET", "potobox-galleries"),
		CaptureDirectory:   captureDir,
		StorageMode:        strings.ToLower(envOr("CAMERA_AGENT_STORAGE", "local")),
	}, nil
}

func requestBaseURL(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}

func cleanupCaptures(dir string, before time.Time) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "dslr-") {
			continue
		}
		if info, err := entry.Info(); err == nil && info.ModTime().Before(before) {
			_ = os.Remove(filepath.Join(dir, entry.Name()))
		}
	}
}

func loadEnvFile() {
	executable, err := os.Executable()
	if err != nil {
		return
	}
	file, err := os.Open(filepath.Join(filepath.Dir(executable), "camera-agent.env"))
	if err != nil {
		return
	}
	defer file.Close()
	// The simple line parser keeps the distributed configuration readable and
	// avoids executing any content from the .env file.
	content, err := io.ReadAll(file)
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(content), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok || os.Getenv(strings.TrimSpace(key)) != "" {
			continue
		}
		_ = os.Setenv(strings.TrimSpace(key), strings.Trim(strings.TrimSpace(value), `"'`))
	}
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func escapeKey(key string) string {
	parts := strings.Split(strings.Trim(key, "/"), "/")
	for index, part := range parts {
		parts[index] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}

func gphotoError(err error, output []byte) error {
	if errors.Is(err, exec.ErrNotFound) {
		return errors.New("gphoto2 tidak ditemukan. Install MSYS2 gphoto2 atau isi GPHOTO2_PATH")
	}
	message := strings.TrimSpace(string(output))
	if message != "" {
		return fmt.Errorf("DSLR tethering gagal: %s", message)
	}
	return fmt.Errorf("DSLR tethering gagal: %w", err)
}

func writeJSON(w http.ResponseWriter, status int, payload response) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, response{Error: &apiError{Message: message}})
}


type printRequest struct {
	PrinterName string `json:"printerName"`
	ImageURL    string `json:"imageUrl"`
	Copies      int    `json:"copies"`
}

func (a *agent) handlePrinters(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	cmd := exec.Command("powershell", "-NoProfile", "-Command", "Get-WmiObject -Class Win32_Printer | Select-Object Name, Default | ConvertTo-Json -Compress")
	output, err := cmd.Output()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to get printers: "+err.Error())
		return
	}

	var raw []map[string]any
	if len(bytes.TrimSpace(output)) > 0 {
		// ConvertTo-Json might return a single object or array
		if bytes.HasPrefix(bytes.TrimSpace(output), []byte("[")) {
			_ = json.Unmarshal(output, &raw)
		} else {
			var single map[string]any
			if err := json.Unmarshal(output, &single); err == nil {
				raw = []map[string]any{single}
			}
		}
	}

	result := []map[string]any{}
	for _, p := range raw {
		name, _ := p["Name"].(string)
		isDef, _ := p["Default"].(bool)
		if name != "" {
			result = append(result, map[string]any{
				"name":      name,
				"isDefault": isDef,
			})
		}
	}

	writeJSON(w, http.StatusOK, response{Data: result})
}

func (a *agent) handlePrints(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}

	var req printRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.PrinterName == "" || req.ImageURL == "" {
		writeError(w, http.StatusBadRequest, "Invalid request. printerName and imageUrl are required.")
		return
	}
	if req.Copies < 1 {
		req.Copies = 1
	}

	// Download image to temp file
	resp, err := a.client.Get(req.ImageURL)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Failed to download image: "+err.Error())
		return
	}
	defer resp.Body.Close()

	tmpFile, err := os.CreateTemp("", "print-*.jpg")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to create temp file: "+err.Error())
		return
	}
	defer os.Remove(tmpFile.Name()) // Clean up after print

	if _, err := io.Copy(tmpFile, resp.Body); err != nil {
		tmpFile.Close()
		writeError(w, http.StatusInternalServerError, "Failed to save image: "+err.Error())
		return
	}
	tmpFile.Close()

	// Build PowerShell script for silent printing
	psScript := fmt.Sprintf(`
Add-Type -AssemblyName System.Drawing
$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrinterSettings.PrinterName = '%%s'
$doc.PrinterSettings.Copies = %%d
$doc.add_PrintPage({
    param($sender, $e)
    $img = [System.Drawing.Image]::FromFile('%%s')
    $e.Graphics.DrawImage($img, $e.PageBounds)
    $img.Dispose()
})
$doc.Print()
`, req.PrinterName, req.Copies, tmpFile.Name())

	cmd := exec.Command("powershell", "-NoProfile", "-Command", psScript)
	if out, err := cmd.CombinedOutput(); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to print: "+string(out))
		return
	}

	writeJSON(w, http.StatusAccepted, response{Data: map[string]any{"status": "printing", "printer": req.PrinterName, "copies": req.Copies}})
}
