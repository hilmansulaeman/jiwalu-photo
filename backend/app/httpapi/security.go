package httpapi

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

type rateLimiter struct {
	mu      sync.Mutex
	window  time.Duration
	clients map[string]rateBucket
}

type rateBucket struct {
	Count     int
	ResetTime time.Time
}

func newRateLimiter(window time.Duration) *rateLimiter {
	return &rateLimiter{
		window:  window,
		clients: map[string]rateBucket{},
	}
}

func (l *rateLimiter) allow(key string, limit int) bool {
	now := time.Now()

	l.mu.Lock()
	defer l.mu.Unlock()

	bucket, ok := l.clients[key]
	if !ok || now.After(bucket.ResetTime) {
		l.clients[key] = rateBucket{Count: 1, ResetTime: now.Add(l.window)}
		return true
	}

	if bucket.Count >= limit {
		return false
	}

	bucket.Count++
	l.clients[key] = bucket
	return true
}

func clientIP(r *http.Request) string {
	if forwardedFor := r.Header.Get("x-forwarded-for"); forwardedFor != "" {
		return strings.TrimSpace(strings.Split(forwardedFor, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}
