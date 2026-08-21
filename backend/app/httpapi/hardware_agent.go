package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// hardwareAgentRequest keeps physical-device credentials on the Go backend.
// Browsers always call Go and never receive the agent API key.
func (s *Server) hardwareAgentRequest(ctx context.Context, method, path string, body any, result any) error {
	if s.cfg.HardwareAgentURL == "" {
		return fmt.Errorf("Hardware Agent belum dikonfigurasi")
	}

	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("encode Hardware Agent request: %w", err)
		}
		reader = bytes.NewReader(encoded)
	}

	ctx, cancel := context.WithTimeout(ctx, 50*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, method, s.cfg.HardwareAgentURL+path, reader)
	if err != nil {
		return fmt.Errorf("prepare Hardware Agent request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if s.cfg.HardwareAgentAPIKey != "" {
		req.Header.Set("X-Hardware-Agent-Key", s.cfg.HardwareAgentAPIKey)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("Hardware Agent tidak dapat dihubungi: %w", err)
	}
	defer resp.Body.Close()

	var envelope struct {
		Data  json.RawMessage `json:"data"`
		Error *apiError       `json:"error"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 16<<20)).Decode(&envelope); err != nil {
		return fmt.Errorf("Hardware Agent mengirim respons tidak valid: %w", err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		if envelope.Error != nil && envelope.Error.Message != "" {
			return fmt.Errorf("Hardware Agent: %s", envelope.Error.Message)
		}
		return fmt.Errorf("Hardware Agent merespons HTTP %d", resp.StatusCode)
	}
	if result != nil && len(envelope.Data) > 0 {
		if err := json.Unmarshal(envelope.Data, result); err != nil {
			return fmt.Errorf("decode Hardware Agent response: %w", err)
		}
	}
	return nil
}

func (s *Server) hardwareAgentDownload(ctx context.Context, path string) ([]byte, error) {
	if s.cfg.HardwareAgentURL == "" {
		return nil, fmt.Errorf("Hardware Agent belum dikonfigurasi")
	}
	ctx, cancel := context.WithTimeout(ctx, 50*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.cfg.HardwareAgentURL+path, nil)
	if err != nil {
		return nil, fmt.Errorf("prepare Hardware Agent download: %w", err)
	}
	if s.cfg.HardwareAgentAPIKey != "" {
		req.Header.Set("X-Hardware-Agent-Key", s.cfg.HardwareAgentAPIKey)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Hardware Agent tidak dapat dihubungi: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("Hardware Agent gagal mengirim foto (HTTP %d)", resp.StatusCode)
	}
	content, err := io.ReadAll(io.LimitReader(resp.Body, s.cfg.MaxBodyBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read Hardware Agent capture: %w", err)
	}
	if int64(len(content)) > s.cfg.MaxBodyBytes {
		return nil, fmt.Errorf("foto dari Hardware Agent melebihi batas ukuran")
	}
	return content, nil
}

func hardwareAgentPathSegment(value string) string {
	return url.PathEscape(strings.TrimSpace(value))
}
