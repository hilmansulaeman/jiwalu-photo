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

// clientIP resolves the real client IP for rate limiting and audit logs.
// This backend runs behind Vercel's edge (see backend/api/index.go) — there
// is no self-managed reverse proxy. Vercel overwrites "x-real-ip" with the
// address that actually connected to its edge (a client cannot spoof it by
// sending its own value), so it is trusted first. "x-forwarded-for" is
// still attacker-prependable at the left end, so if x-real-ip is absent we
// take the right-most entry instead of the left-most one — that is the hop
// Vercel itself appended, not anything the client supplied.
func clientIP(r *http.Request) string {
	if realIP := strings.TrimSpace(r.Header.Get("x-real-ip")); realIP != "" {
		return realIP
	}
	if forwardedFor := r.Header.Get("x-forwarded-for"); forwardedFor != "" {
		parts := strings.Split(forwardedFor, ",")
		return strings.TrimSpace(parts[len(parts)-1])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}
