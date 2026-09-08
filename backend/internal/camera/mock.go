package camera

import (
	"context"
	"encoding/base64"
	"time"
)

// MockProvider returns canned responses. Used for frontend/dev work and CI
// where no physical camera or bridge process is available — it never shells
// out, spawns a process, or touches a real device.
//
// This replaces photobooth-ui/camera-bridge.js, which did the same job as a
// separate Node process that also (by convention only, never enforced)
// shared port 8788 with the real Canon EDSDK bridge.
type MockProvider struct{}

func NewMockProvider() *MockProvider {
	return &MockProvider{}
}

func (p *MockProvider) List(ctx context.Context) ([]Info, error) {
	return []Info{{Model: "Mock Camera", Port: "mock:0001"}}, nil
}

func (p *MockProvider) Capture(ctx context.Context, port string) ([]byte, error) {
	select {
	case <-time.After(300 * time.Millisecond): // simulate shutter/transfer latency
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	return mockJPEG, nil
}

func (p *MockProvider) LiveViewFrame(ctx context.Context) ([]byte, string, error) {
	return mockJPEG, "image/jpeg", nil
}

// Minimal 1x1 JPEG so MockProvider never touches disk.
var mockJPEG, _ = base64.StdEncoding.DecodeString(
	"/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////" +
		"//////////////////////////////////////////////////wgALCAABAAEBAREA/8QA" +
		"FBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
)
