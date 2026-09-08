package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"urbanmenphoto/backend/internal/camera"
)

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

func (s *Server) handleDSLRLiveView(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	frame, contentType, err := s.cameraProvider.LiveViewFrame(r.Context())
	if err != nil {
		if errors.Is(err, camera.ErrLiveViewUnsupported) {
			writeError(w, http.StatusNotImplemented, "Live view tidak didukung provider kamera ini.")
			return
		}
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(frame)
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

// detectDSLRCameras and captureDSLR know nothing about gphoto2, the Hardware
// Agent HTTP contract, or the Canon EDSDK bridge — that's all behind
// s.cameraProvider (see internal/camera). Only the storage decision
// (Supabase vs local /files/tether) stays here, since it's shared by every
// provider.

func (s *Server) detectDSLRCameras(ctx context.Context) ([]dslrCamera, error) {
	infos, err := s.cameraProvider.List(ctx)
	if err != nil {
		return nil, err
	}
	cameras := make([]dslrCamera, 0, len(infos))
	for _, info := range infos {
		cameras = append(cameras, dslrCamera{Model: info.Model, Port: info.Port})
	}
	return cameras, nil
}

func (s *Server) captureDSLR(ctx context.Context, port string) (string, error) {
	if strings.ContainsAny(port, "\r\n") {
		return "", errors.New("DSLR camera ID is invalid")
	}

	content, err := s.cameraProvider.Capture(ctx, port)
	if err != nil {
		return "", err
	}
	if len(content) == 0 {
		return "", errors.New("Kamera tidak mengembalikan foto")
	}

	dir := filepath.Join(s.cfg.StorageDir, "tether")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("prepare tether storage: %w", err)
	}
	cleanupTetherFiles(dir, time.Now().Add(-24*time.Hour))
	name := fmt.Sprintf("dslr-%d.jpg", time.Now().UnixNano())

	if s.hasSupabaseStorage() {
		key := filepath.ToSlash(filepath.Join("tether", name))
		publicURL, err := s.uploadSupabaseObject(key, "image/jpeg", content)
		if err != nil {
			return "", err
		}
		return publicURL, nil
	}

	filePath := filepath.Join(dir, name)
	if err := os.WriteFile(filePath, content, 0644); err != nil {
		return "", fmt.Errorf("save DSLR capture: %w", err)
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
