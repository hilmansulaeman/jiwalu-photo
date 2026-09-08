package camera

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// EdsdkBridgeProvider talks to the standalone Canon EDSDK bridge
// (photobooth-ui/canon-bridge — a Windows-only .NET process wrapping the
// real Canon SDK) over HTTP. This package never touches EDSDK.dll directly;
// the bridge process is the only thing that does. See the "Canon SDK
// Architecture" section of the audit for why that boundary exists.
type EdsdkBridgeProvider struct {
	baseURL string
	client  *http.Client
}

func NewEdsdkBridgeProvider(baseURL string) *EdsdkBridgeProvider {
	return &EdsdkBridgeProvider{
		baseURL: strings.TrimRight(baseURL, "/"),
		client:  &http.Client{Timeout: 20 * time.Second},
	}
}

func (p *EdsdkBridgeProvider) List(ctx context.Context) ([]Info, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.baseURL+"/api/cameras", nil)
	if err != nil {
		return nil, err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Canon bridge tidak dapat dihubungi: %w", err)
	}
	defer resp.Body.Close()

	var cameras []Info
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&cameras); err != nil {
		return nil, fmt.Errorf("Canon bridge mengirim respons tidak valid: %w", err)
	}
	return cameras, nil
}

func (p *EdsdkBridgeProvider) Capture(ctx context.Context, port string) ([]byte, error) {
	captureCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	endpoint := "/api/cameras/capture"
	if strings.TrimSpace(port) != "" {
		endpoint = "/api/cameras/" + pathSegment(port) + "/capture"
	}
	req, err := http.NewRequestWithContext(captureCtx, http.MethodPost, p.baseURL+endpoint, nil)
	if err != nil {
		return nil, err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Canon bridge tidak dapat dihubungi: %w", err)
	}
	defer resp.Body.Close()

	var captured struct {
		Success bool   `json:"success"`
		URL     string `json:"url"`
		Error   string `json:"error"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&captured); err != nil {
		return nil, fmt.Errorf("Canon bridge mengirim respons tidak valid: %w", err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices || !captured.Success {
		if captured.Error != "" {
			return nil, fmt.Errorf("Canon bridge: %s", captured.Error)
		}
		return nil, fmt.Errorf("Canon bridge merespons HTTP %d", resp.StatusCode)
	}
	if captured.URL == "" {
		return nil, fmt.Errorf("Canon bridge tidak mengembalikan URL foto")
	}

	// The bridge's capture response is a URL back to its own static file
	// server (e.g. http://127.0.0.1:8788/captures/xyz.jpg) — fetch it so the
	// caller gets bytes just like every other provider.
	imgReq, err := http.NewRequestWithContext(ctx, http.MethodGet, captured.URL, nil)
	if err != nil {
		return nil, err
	}
	imgResp, err := p.client.Do(imgReq)
	if err != nil {
		return nil, fmt.Errorf("gagal mengunduh foto dari Canon bridge: %w", err)
	}
	defer imgResp.Body.Close()
	content, err := io.ReadAll(io.LimitReader(imgResp.Body, 40<<20))
	if err != nil {
		return nil, fmt.Errorf("read Canon bridge capture: %w", err)
	}
	return content, nil
}

func (p *EdsdkBridgeProvider) LiveViewFrame(ctx context.Context) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.baseURL+"/api/liveview", nil)
	if err != nil {
		return nil, "", err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("Canon bridge tidak dapat dihubungi: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, "", fmt.Errorf("Canon bridge live view HTTP %d", resp.StatusCode)
	}
	content, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return nil, "", fmt.Errorf("read Canon bridge live view: %w", err)
	}
	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/jpeg"
	}
	return content, contentType, nil
}
