package camera

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// GphotoAgentProvider talks to the standalone camera-agent binary
// (backend/cmd/camera-agent) over HTTP. Physical-device credentials never
// leave this process — the browser only ever talks to the Go backend.
//
// This is a straight extraction of what used to be
// app/httpapi/hardware_agent.go + the agent branch of dslr.go — behavior is
// unchanged, only the boundary moved.
type GphotoAgentProvider struct {
	baseURL      string
	apiKey       string
	maxBodyBytes int64
	client       *http.Client
}

func NewGphotoAgentProvider(baseURL, apiKey string, maxBodyBytes int64) *GphotoAgentProvider {
	return &GphotoAgentProvider{
		baseURL:      strings.TrimRight(baseURL, "/"),
		apiKey:       apiKey,
		maxBodyBytes: maxBodyBytes,
		client:       http.DefaultClient,
	}
}

func (p *GphotoAgentProvider) List(ctx context.Context) ([]Info, error) {
	var cameras []Info
	if err := p.request(ctx, http.MethodGet, "/api/cameras", nil, &cameras); err != nil {
		return nil, err
	}
	return cameras, nil
}

func (p *GphotoAgentProvider) Capture(ctx context.Context, port string) ([]byte, error) {
	if strings.TrimSpace(port) == "" || strings.ContainsAny(port, "\r\n") {
		return nil, errors.New("DSLR camera ID is invalid")
	}
	var captured struct {
		FileName string `json:"fileName"`
	}
	if err := p.request(ctx, http.MethodPost, "/api/cameras/"+pathSegment(port)+"/capture", nil, &captured); err != nil {
		return nil, err
	}
	if captured.FileName == "" {
		return nil, errors.New("Hardware Agent did not return a capture file")
	}
	content, err := p.download(ctx, "/api/captures/"+pathSegment(captured.FileName))
	if err != nil {
		return nil, err
	}
	if len(content) == 0 {
		return nil, errors.New("Hardware Agent returned an empty image")
	}
	return content, nil
}

func (p *GphotoAgentProvider) LiveViewFrame(ctx context.Context) ([]byte, string, error) {
	return nil, "", ErrLiveViewUnsupported
}

func (p *GphotoAgentProvider) request(ctx context.Context, method, path string, body, result any) error {
	if p.baseURL == "" {
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
	req, err := http.NewRequestWithContext(ctx, method, p.baseURL+path, reader)
	if err != nil {
		return fmt.Errorf("prepare Hardware Agent request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if p.apiKey != "" {
		req.Header.Set("X-Hardware-Agent-Key", p.apiKey)
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return fmt.Errorf("Hardware Agent tidak dapat dihubungi: %w", err)
	}
	defer resp.Body.Close()

	var envelope struct {
		Data  json.RawMessage `json:"data"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
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

func (p *GphotoAgentProvider) download(ctx context.Context, path string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 50*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.baseURL+path, nil)
	if err != nil {
		return nil, fmt.Errorf("prepare Hardware Agent download: %w", err)
	}
	if p.apiKey != "" {
		req.Header.Set("X-Hardware-Agent-Key", p.apiKey)
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Hardware Agent tidak dapat dihubungi: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("Hardware Agent gagal mengirim foto (HTTP %d)", resp.StatusCode)
	}
	limit := p.maxBodyBytes
	if limit <= 0 {
		limit = 40 << 20
	}
	content, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil {
		return nil, fmt.Errorf("read Hardware Agent capture: %w", err)
	}
	if int64(len(content)) > limit {
		return nil, fmt.Errorf("foto dari Hardware Agent melebihi batas ukuran")
	}
	return content, nil
}

func pathSegment(value string) string {
	return url.PathEscape(strings.TrimSpace(value))
}
