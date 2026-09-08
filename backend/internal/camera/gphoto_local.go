package camera

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// GphotoLocalProvider shells out to the gphoto2 CLI on this machine. Used
// when no remote Hardware Agent is configured — local dev, or a booth PC
// running the Go backend directly against its own USB camera.
//
// gphoto2 talks directly to a USB camera and cannot safely serve two
// commands at once, so every call is serialized through mu — this is the
// same guarantee GphotoAgentProvider's remote camera-agent process already
// enforces on its own side, just applied here for the local-shell-out case.
type GphotoLocalProvider struct {
	mu sync.Mutex
}

func NewGphotoLocalProvider() *GphotoLocalProvider {
	return &GphotoLocalProvider{}
}

func (p *GphotoLocalProvider) List(ctx context.Context) ([]Info, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	exec.CommandContext(ctx, "killall", "PTPCamera").Run()
	output, err := exec.CommandContext(ctx, "gphoto2", "--auto-detect").CombinedOutput()
	if err != nil {
		return nil, commandError(err, output)
	}

	cameras := []Info{}
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
		cameras = append(cameras, Info{Model: strings.TrimSpace(strings.TrimSuffix(line, port)), Port: port})
	}
	return cameras, nil
}

func (p *GphotoLocalProvider) Capture(ctx context.Context, port string) ([]byte, error) {
	if strings.ContainsAny(port, "\r\n") || !strings.HasPrefix(port, "usb:") {
		return nil, errors.New("DSLR port is invalid")
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	tmpFile, err := os.CreateTemp("", "dslr-capture-*.jpg")
	if err != nil {
		return nil, fmt.Errorf("prepare capture temp file: %w", err)
	}
	tmpPath := tmpFile.Name()
	tmpFile.Close()
	defer os.Remove(tmpPath)

	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	exec.CommandContext(ctx, "killall", "PTPCamera").Run()
	output, err := exec.CommandContext(ctx, "gphoto2", "--port", port, "--capture-image-and-download", "--force-overwrite", "--filename", tmpPath).CombinedOutput()
	if err != nil {
		return nil, commandError(err, output)
	}

	content, err := os.ReadFile(tmpPath)
	if err != nil || len(content) == 0 {
		return nil, errors.New("DSLR did not return an image")
	}
	return content, nil
}

func (p *GphotoLocalProvider) LiveViewFrame(ctx context.Context) ([]byte, string, error) {
	return nil, "", ErrLiveViewUnsupported
}

func commandError(err error, output []byte) error {
	message := strings.TrimSpace(string(output))
	if errors.Is(err, exec.ErrNotFound) {
		return errors.New("gphoto2 belum terpasang di komputer booth. Instal gphoto2 terlebih dahulu")
	}
	if message != "" {
		return fmt.Errorf("DSLR tethering gagal: %s", message)
	}
	return fmt.Errorf("DSLR tethering gagal: %w", err)
}
