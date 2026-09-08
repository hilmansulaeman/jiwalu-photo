// Package camera is the boundary between the DSLR HTTP handlers
// (app/httpapi/dslr.go) and the concrete way a photo actually gets off a
// camera. Handlers depend only on Provider — never on gphoto2, the Hardware
// Agent HTTP contract, or the Canon EDSDK bridge directly.
package camera

import (
	"context"
	"errors"
)

// ErrLiveViewUnsupported is returned by LiveViewFrame on providers that have
// no live-view capability (gphoto2 has none; mock doesn't need one). Handlers
// turn this into a 501, not a 500.
var ErrLiveViewUnsupported = errors.New("provider ini tidak mendukung live view")

// Info describes one detected camera. Field names/tags match the existing
// /api/dslr/cameras response shape so switching providers never changes the
// API contract.
type Info struct {
	Model string `json:"model"`
	Port  string `json:"port"`
}

// Provider is implemented by every way this system can talk to a camera: a
// remote gphoto2 agent process (GphotoAgentProvider), a local gphoto2 CLI
// shell-out (GphotoLocalProvider), the Canon EDSDK bridge in
// photobooth-ui/canon-bridge (EdsdkBridgeProvider), or a mock for dev/CI
// (MockProvider).
type Provider interface {
	List(ctx context.Context) ([]Info, error)
	// Capture triggers a shutter release and returns the raw JPEG bytes.
	Capture(ctx context.Context, port string) ([]byte, error)
	// LiveViewFrame returns one preview frame (image bytes + content type).
	// Returns ErrLiveViewUnsupported if the provider has no live view.
	LiveViewFrame(ctx context.Context) ([]byte, string, error)
}
