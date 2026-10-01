// Package camera is the boundary between the DSLR HTTP handlers
// (app/httpapi/dslr.go) and the concrete way a photo actually gets off a
// camera. Handlers depend only on Provider — never on the Canon EDSDK bridge
// HTTP contract directly.
package camera

import (
	"context"
	"errors"
)

// ErrLiveViewUnsupported is returned by LiveViewFrame on providers that have
// no live-view capability. Handlers turn this into a 501, not a 500.
var ErrLiveViewUnsupported = errors.New("provider ini tidak mendukung live view")

// Info describes one detected camera. Field names/tags match the existing
// /api/dslr/cameras response shape.
type Info struct {
	Model string `json:"model"`
	Port  string `json:"port"`
}

// Provider is the boundary handlers use to talk to a camera. The only
// implementation is EdsdkBridgeProvider, which talks to the Canon EDSDK
// bridge in photobooth-ui/canon-bridge.
type Provider interface {
	List(ctx context.Context) ([]Info, error)
	// Capture triggers a shutter release and returns the raw JPEG bytes.
	Capture(ctx context.Context, port string) ([]byte, error)
	// LiveViewFrame returns one preview frame (image bytes + content type).
	// Returns ErrLiveViewUnsupported if the provider has no live view.
	LiveViewFrame(ctx context.Context) ([]byte, string, error)
}
