package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"urbanmenphoto/backend/app/config"
	"urbanmenphoto/backend/app/store"
)

func TestHardwareAgentProxiesDSLRRequests(t *testing.T) {
	agent := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Hardware-Agent-Key") != "agent-secret" {
			t.Fatalf("agent key was not forwarded")
		}
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/cameras":
			_, _ = w.Write([]byte(`{"data":[{"model":"Canon EOS","port":"camera-serial-1"}]}`))
		case r.Method == http.MethodPost && r.URL.Path == "/api/cameras/camera-serial-1/capture":
			_, _ = w.Write([]byte(`{"data":{"fileName":"canon-test.jpg"}}`))
		case r.Method == http.MethodGet && r.URL.Path == "/api/captures/canon-test.jpg":
			_, _ = w.Write([]byte("fake-jpeg"))
		default:
			t.Fatalf("unexpected agent request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer agent.Close()

	jsonStore, err := store.NewJSONStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(config.Config{HardwareAgentURL: agent.URL, HardwareAgentAPIKey: "agent-secret", MaxBodyBytes: 1024, StorageDir: t.TempDir(), PublicBaseURL: "http://localhost:8787"}, jsonStore)

	list := httptest.NewRecorder()
	server.Routes().ServeHTTP(list, httptest.NewRequest(http.MethodGet, "/api/dslr/cameras", nil))
	if list.Code != http.StatusOK || !strings.Contains(list.Body.String(), "camera-serial-1") {
		t.Fatalf("unexpected camera list response: %d %s", list.Code, list.Body.String())
	}

	capture := httptest.NewRecorder()
	server.Routes().ServeHTTP(capture, httptest.NewRequest(http.MethodPost, "/api/dslr/capture", strings.NewReader(`{"port":"camera-serial-1"}`)))
	if capture.Code != http.StatusOK || !strings.Contains(capture.Body.String(), "/files/tether/dslr-") {
		t.Fatalf("unexpected capture response: %d %s", capture.Code, capture.Body.String())
	}
}
