# Canon EDSDK Bridge

Windows-only local HTTP service that wraps Canon's EDSDK.dll so the Go
backend (`backend/internal/camera/edsdk_bridge.go`, `CAMERA_PROVIDER=edsdk-bridge`)
can talk to a Canon EOS camera. Runs on the same PC as the tethered camera,
listens on `127.0.0.1:8788` only — never expose it beyond loopback.

## 1. Prerequisites

- Windows 10/11 x64.
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0).
- A Canon EDSDK license: register at the [Canon Developer Program](https://developers.canon-europe.com/s/) (region-specific portal) to get `EDSDK.dll` + `EDSDK.h`. We cannot ship these — they're Canon's proprietary files.
- Canon's own camera driver installed (comes with EOS Utility / Canon's driver package). **Do not** install a WinUSB/Zadig driver — that's a different, incompatible model used by the gphoto2-based `camera-agent` in this repo; EDSDK needs Canon's native WIA/PTP driver.

## 2. Get the SDK files in place

Drop the files from your Canon EDSDK download into:

```
vendor/edsdk/EDSDK.dll
vendor/edsdk/EDSDK.h        (reference only, not compiled — useful to diff against Edsdk/EdsdkConstants.cs if a call returns EDS_ERR_ILLEGAL_PARAMETER)
```

These are gitignored — never commit them.

## 3. Build

```
dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -o dist
```

Then copy `vendor/edsdk/EDSDK.dll` next to `dist/CanonBridge.exe` — it's a
native DLL and can't be embedded into the single-file bundle, it must sit
alongside the exe at runtime.

## 4. Run

Copy `dist/CanonBridge.exe` + `EDSDK.dll` + `appsettings.json` to the booth
PC and run the exe. For an always-on setup, add a shortcut to the Windows
Start Menu startup folder — mirrors how `backend/cmd/camera-agent` is
installed on the same class of machine.

Config (`appsettings.json` or env vars):
- `ListenUrl` (default `http://127.0.0.1:8788`) — keep this on loopback.
- `CANON_BRIDGE_MOCK=1` or `--mock` — run without a camera/EDSDK.dll, for testing.

## 5. Verify

With the bridge running (`--mock` mode is enough, no camera needed):

```
./scripts/smoke.sh
```

Runs the exact 3 curl checks against `/api/cameras`, `/api/cameras/capture`,
`/api/liveview` and validates the JSON/byte shapes the Go client expects.

To test with the real Go backend (still no camera needed, bridge in mock
mode): set `CAMERA_PROVIDER=edsdk-bridge` and `CANON_BRIDGE_URL=http://127.0.0.1:8788`
in the backend's env, then hit `/api/dslr/cameras` and `/api/dslr/capture`
through the real backend — this exercises `edsdk_bridge.go`'s actual
marshaling/URL-follow logic, not just curl.

Only after that passes, flip mock off and repeat with a real camera attached.

## 6. Troubleshooting

- **"device busy"**: another process (EOS Utility, Canon's own apps, or a
  second instance of this bridge) already holds an EDSDK session on the
  camera — only one process may hold a session at a time. Close it.
- **Capture request hangs forever**: the EDSDK message-pump thread isn't
  running or isn't pumping fast enough — this is the one thing `--mock` mode
  can't catch, only shows up with a real camera attached.
- **No camera detected**: check the camera is on, connected via USB, awake
  (not in sleep mode), and Canon's native driver (not WinUSB) is installed.
