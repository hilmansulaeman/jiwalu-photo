package httpapi

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// Supabase Storage is optional so a kiosk can still run without an internet
// connection. When configured, captured and finalized images are uploaded to
// the bucket and the local disk is used only as a short-lived gphoto2 staging
// area.
func (s *Server) hasSupabaseStorage() bool {
	return s.cfg.SupabaseURL != "" && s.cfg.SupabaseServiceRoleKey != "" && s.cfg.SupabaseBucket != ""
}

func (s *Server) uploadSupabaseObject(key, mimeType string, content []byte) (string, error) {
	if !s.hasSupabaseStorage() {
		return "", fmt.Errorf("Supabase Storage is not configured")
	}

	requestURL := strings.TrimRight(s.cfg.SupabaseURL, "/") + "/storage/v1/object/" + url.PathEscape(s.cfg.SupabaseBucket) + "/" + escapeStorageKey(key)
	req, err := http.NewRequest(http.MethodPost, requestURL, bytes.NewReader(content))
	if err != nil {
		return "", fmt.Errorf("create Supabase upload request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.cfg.SupabaseServiceRoleKey)
	req.Header.Set("apikey", s.cfg.SupabaseServiceRoleKey)
	req.Header.Set("Content-Type", mimeType)
	req.Header.Set("x-upsert", "true")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("upload image to Supabase: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		message, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return "", fmt.Errorf("upload image to Supabase: status %d: %s", resp.StatusCode, strings.TrimSpace(string(message)))
	}

	return strings.TrimRight(s.cfg.SupabaseURL, "/") + "/storage/v1/object/public/" + url.PathEscape(s.cfg.SupabaseBucket) + "/" + escapeStorageKey(key), nil
}

func escapeStorageKey(key string) string {
	parts := strings.Split(strings.Trim(key, "/"), "/")
	for index, part := range parts {
		parts[index] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}
