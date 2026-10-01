import { getBackendApiUrl } from './backendApi.js';

const localAgentMessage = 'Canon EDSDK bridge belum terhubung. Pastikan CanonBridge.exe dan backend booth berjalan di mini PC.';

async function tetherRequest(path, options) {
  // Hardware stays private on the booth PC. The browser talks only to the
  // local Go backend, which authenticates and forwards the request to .NET.
  const agentUrl = getBackendApiUrl();
  try {
    const response = await fetch(`${agentUrl}${path}`, {
      ...options,
      headers: {
        ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options?.headers || {}),
      },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `Request failed with status ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload?.data ?? payload;
  } catch (error) {
    if (error?.status === 404 || error?.status === 501) throw new Error(localAgentMessage);
    throw error;
  }
}

export async function listDslrCameras() {
  return tetherRequest('/api/dslr/cameras');
}

export async function captureDslrPhoto(port) {
  return tetherRequest('/api/dslr/capture', {
    method: 'POST',
    body: JSON.stringify({ port }),
  });
}
