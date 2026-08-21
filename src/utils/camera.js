export async function getCameraStream(cameraOptions = 'user') {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Browser ini belum mendukung akses kamera.');
  }

  const options = typeof cameraOptions === 'string'
    ? { facingMode: cameraOptions }
    : (cameraOptions || {});

  const videoConstraints = {
    width: { ideal: 1440 },
    height: { ideal: 1080 },
  };

  if (options.deviceId) {
    videoConstraints.deviceId = { exact: options.deviceId };
  } else if (!options.any) {
    videoConstraints.facingMode = { ideal: options.facingMode || 'user' };
  }

  return navigator.mediaDevices.getUserMedia({
    video: videoConstraints,
    audio: false,
  });
}

export async function listVideoDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    throw new Error('Browser ini belum mendukung daftar kamera.');
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter(device => device.kind === 'videoinput')
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Camera ${index + 1}`,
      groupId: device.groupId,
    }));
}

// Virtual/mobile cameras can receive a new deviceId after reconnecting. Resolve
// the saved label before falling back to the selected camera direction.
export async function getCameraStreamForProfile(profile = {}, fallbackFacingMode = 'user') {
  const facingMode = profile.facingMode || fallbackFacingMode;
  const requestedDeviceId = profile.deviceId || '';

  try {
    const stream = await getCameraStream({ facingMode, deviceId: requestedDeviceId });
    const track = stream.getVideoTracks?.()[0];
    return {
      stream,
      deviceId: track?.getSettings?.().deviceId || requestedDeviceId,
      deviceLabel: track?.label || profile.deviceLabel || '',
      recovered: false,
    };
  } catch (initialError) {
    if (!requestedDeviceId) throw initialError;

    const devices = await listVideoDevices();
    const matchingDevice = devices.find(device => device.label === profile.deviceLabel);
    const stream = await getCameraStream({ facingMode, deviceId: matchingDevice?.deviceId || '' });
    const track = stream.getVideoTracks?.()[0];
    return {
      stream,
      deviceId: track?.getSettings?.().deviceId || matchingDevice?.deviceId || '',
      deviceLabel: track?.label || matchingDevice?.label || profile.deviceLabel || '',
      recovered: true,
    };
  }
}

export function stopStream(stream) {
  stream?.getTracks?.().forEach(track => track.stop());
}

export function captureVideoFrame(videoElement, options = {}) {
  const { mirror = false } = options;

  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  const ctx = canvas.getContext('2d');

  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  // Draw base video
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/jpeg', 0.95);
}
