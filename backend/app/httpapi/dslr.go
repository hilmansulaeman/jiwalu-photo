package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// gphoto2 talks directly to a USB camera and cannot safely serve two commands
// at once. The mutex also prevents two booth screens from triggering the same
// DSLR simultaneously.
var dslrCommandMu sync.Mutex

type dslrCamera struct {
	Model string `json:"model"`
	Port  string `json:"port"`
}

type dslrCaptureRequest struct {
	Port string `json:"port"`
}

func (s *Server) handleDSLRCameras(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	cameras, err := s.detectDSLRCameras(r.Context())
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, response{Data: cameras})
}

func (s *Server) handleDSLRCapture(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	var body dslrCaptureRequest
	if err := readJSON(r, &body); err != nil || strings.TrimSpace(body.Port) == "" {
		writeError(w, http.StatusBadRequest, "DSLR port is required.")
		return
	}
	url, err := s.captureDSLR(r.Context(), strings.TrimSpace(body.Port))
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, response{Data: map[string]string{"url": url}})
}

func (s *Server) detectDSLRCameras(ctx context.Context) ([]dslrCamera, error) {
	if s.cfg.HardwareAgentURL != "" {
		var cameras []dslrCamera
		if err := s.hardwareAgentRequest(ctx, http.MethodGet, "/api/cameras", nil, &cameras); err != nil {
			return nil, err
		}
		return cameras, nil
	}
	dslrCommandMu.Lock()
	defer dslrCommandMu.Unlock()
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	exec.CommandContext(ctx, "killall", "PTPCamera").Run()
	output, err := exec.CommandContext(ctx, "gphoto2", "--auto-detect").CombinedOutput()
	if err != nil {
		return nil, dslrCommandError(err, output)
	}
	cameras := []dslrCamera{}
	for _, line := range strings.Split(string(output), "\n") {
		line = strings.TrimSpace(line)
		fields := strings.Fields(line)
		if len(fields) < 2 || !strings.Contains(fields[len(fields)-1], ":") {
			continue
		}
		port := fields[len(fields)-1]
		if !strings.HasPrefix(port, "usb:") {
			continue
		}
		cameras = append(cameras, dslrCamera{Model: strings.TrimSpace(strings.TrimSuffix(line, port)), Port: port})
	}
	return cameras, nil
}

func (s *Server) captureDSLR(ctx context.Context, port string) (string, error) {
	if s.cfg.HardwareAgentURL != "" {
		if strings.TrimSpace(port) == "" || strings.ContainsAny(port, "\r\n") {
			return "", errors.New("DSLR camera ID is invalid")
		}
		var captured struct {
			FileName string `json:"fileName"`
		}
		if err := s.hardwareAgentRequest(ctx, http.MethodPost, "/api/cameras/"+hardwareAgentPathSegment(port)+"/capture", nil, &captured); err != nil {
			return "", err
		}
		if captured.FileName == "" {
			return "", errors.New("Hardware Agent did not return a capture file")
		}
		content, err := s.hardwareAgentDownload(ctx, "/api/captures/"+hardwareAgentPathSegment(captured.FileName))
		if err != nil || len(content) == 0 {
			if err != nil {
				return "", err
			}
			return "", errors.New("Hardware Agent returned an empty image")
		}
		dir := filepath.Join(s.cfg.StorageDir, "tether")
		if err := os.MkdirAll(dir, 0755); err != nil {
			return "", fmt.Errorf("prepare tether storage: %w", err)
		}
		cleanupTetherFiles(dir, time.Now().Add(-24*time.Hour))
		name := fmt.Sprintf("dslr-%d.jpg", time.Now().UnixNano())
		filePath := filepath.Join(dir, name)
		if err := os.WriteFile(filePath, content, 0644); err != nil {
			return "", fmt.Errorf("save Hardware Agent capture: %w", err)
		}
		if s.hasSupabaseStorage() {
			key := filepath.ToSlash(filepath.Join("tether", name))
			publicURL, err := s.uploadSupabaseObject(key, "image/jpeg", content)
			if err != nil {
				return "", err
			}
			_ = os.Remove(filePath)
			return publicURL, nil
		}
		return strings.TrimRight(s.cfg.PublicBaseURL, "/") + "/files/tether/" + name, nil
	}
	dslrCommandMu.Lock()
	defer dslrCommandMu.Unlock()
	if strings.ContainsAny(port, "\r\n") || !strings.HasPrefix(port, "usb:") {
		return "", errors.New("DSLR port is invalid")
	}
	dir := filepath.Join(s.cfg.StorageDir, "tether")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("prepare tether storage: %w", err)
	}
	cleanupTetherFiles(dir, time.Now().Add(-24*time.Hour))
	name := fmt.Sprintf("dslr-%d.jpg", time.Now().UnixNano())
	filePath := filepath.Join(dir, name)
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	exec.CommandContext(ctx, "killall", "PTPCamera").Run()
	output, err := exec.CommandContext(ctx, "gphoto2", "--port", port, "--capture-image-and-download", "--force-overwrite", "--filename", filePath).CombinedOutput()
	if err != nil {
		_ = os.Remove(filePath)
		return "", dslrCommandError(err, output)
	}
	if info, err := os.Stat(filePath); err != nil || info.Size() == 0 {
		return "", errors.New("DSLR did not return an image")
	}
	if s.hasSupabaseStorage() {
		content, err := os.ReadFile(filePath)
		if err != nil {
			return "", fmt.Errorf("read DSLR image: %w", err)
		}
		key := filepath.ToSlash(filepath.Join("tether", name))
		publicURL, err := s.uploadSupabaseObject(key, "image/jpeg", content)
		if err != nil {
			return "", err
		}
		_ = os.Remove(filePath)
		return publicURL, nil
	}
	return strings.TrimRight(s.cfg.PublicBaseURL, "/") + "/files/tether/" + name, nil
}

func cleanupTetherFiles(dir string, before time.Time) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "dslr-") {
			continue
		}
		info, err := entry.Info()
		if err == nil && info.ModTime().Before(before) {
			_ = os.Remove(filepath.Join(dir, entry.Name()))
		}
	}
}

func dslrCommandError(err error, output []byte) error {
	message := strings.TrimSpace(string(output))
	if errors.Is(err, exec.ErrNotFound) {
		return errors.New("gphoto2 belum terpasang di komputer booth. Instal gphoto2 terlebih dahulu")
	}
	if message != "" {
		return fmt.Errorf("DSLR tethering gagal: %s", message)
	}
	return fmt.Errorf("DSLR tethering gagal: %w", err)
}
