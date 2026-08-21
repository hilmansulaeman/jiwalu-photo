URBANMEN PHOTO - CAMERA AGENT FOR WINDOWS

PHASE 1 - ONE CANON CAMERA VIA ZADIG / WINUSB

1. Connect one powered-on Canon DSLR in photo mode with a data USB cable.
2. Use Zadig to install WinUSB for that exact camera. Close Dreambooth,
   EOS Utility, Chrome, and every other camera application afterward.
3. Install the Windows/MSYS2 build of gphoto2 and its libgphoto2/libusb
   dependencies. Set GPHOTO2_PATH in camera-agent.env to gphoto2.exe.
4. Edit camera-agent.env:
   - CAMERA_PROVIDER=gphoto2
   - CAMERA_AGENT_STORAGE=local
   - ALLOWED_ORIGINS=the exact frontend URL (or local development origin)
5. Start "Urbanmen Photo Camera Agent" from the Start menu.
6. On the booth PC open http://127.0.0.1:8787/api/cameras. One camera must
   appear before opening the photo-box dashboard.
7. Build the photo-box frontend with:
   VITE_HARDWARE_AGENT_URL=http://127.0.0.1:8787

The agent exposes GET /api/cameras, POST /api/cameras/{id}/capture, and
GET /api/captures/{fileName}. It retains photos locally for 24 hours.

PHASE 2 - TWO CAMERAS WITH PERMANENT MAPPING

Connect both cameras, then refresh the Camera Device Booth list. The agent
reads each camera's serial from gphoto2 --summary and returns canon:<serial>.
Assign a different canon:<serial> value to Posisi Kamera 1 and Posisi Kamera 2,
then save. These IDs stay valid when USB bus/device numbers change after a
replug. Do not save an item labelled "ID sementara"; that camera did not
return a serial number and must be fixed before it can be mapped permanently.
Do not run a Cloudflare Tunnel for phase 1: the USB bridge stays on the booth PC.
