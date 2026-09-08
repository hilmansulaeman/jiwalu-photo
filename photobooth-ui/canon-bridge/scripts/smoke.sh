#!/usr/bin/env bash
# Smoke-tests the Canon bridge HTTP contract against a running --mock
# instance. Run: dotnet run --mock  (in another terminal), then this script.
set -euo pipefail

BASE="${CANON_BRIDGE_URL:-http://127.0.0.1:8788}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "== GET /api/cameras =="
curl -sf "$BASE/api/cameras" | tee "$TMP/cameras.json"
grep -q '"model"' "$TMP/cameras.json" && grep -q '"port"' "$TMP/cameras.json"
echo "OK"

echo "== POST /api/cameras/capture =="
curl -sf -X POST "$BASE/api/cameras/capture" | tee "$TMP/capture.json"
grep -q '"success":true' "$TMP/capture.json"
URL=$(grep -o '"url":"[^"]*"' "$TMP/capture.json" | cut -d'"' -f4)
[ -n "$URL" ]
curl -sf "$URL" -o "$TMP/out.jpg"
[ -s "$TMP/out.jpg" ]
echo "OK ($URL -> $(wc -c < "$TMP/out.jpg") bytes)"

echo "== GET /api/liveview =="
curl -sf "$BASE/api/liveview" -D "$TMP/headers.txt" -o "$TMP/frame.jpg"
grep -qi '^Content-Type: image/jpeg' "$TMP/headers.txt"
[ -s "$TMP/frame.jpg" ]
echo "OK"

echo "All checks passed."
