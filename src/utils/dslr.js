import { getBackendApiUrl } from './backendApi.js';

const localAgentMessage = 'Hardware Agent DSLR belum terhubung. Pastikan Hardware Agent dan backend booth berjalan di mini PC.';
const localHardwareAgentUrl = (import.meta.env.VITE_HARDWARE_AGENT_URL || '').replace(/\/$/, '');

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

async function localAgentRequest(path, options) {
  const response = await fetch(`${localHardwareAgentUrl}${path}`, {
    ...options,
    headers: {
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || `Hardware Agent failed with status ${response.status}`);
  return payload?.data ?? payload;
}

export async function listDslrCameras() {
  if (localHardwareAgentUrl) return localAgentRequest('/api/cameras');
  return tetherRequest('/api/dslr/cameras');
}

export async function captureDslrPhoto(port) {
  if (localHardwareAgentUrl) {
    const result = await localAgentRequest(`/api/cameras/${encodeURIComponent(port)}/capture`, { method: 'POST' });
    // Camera bridges may return either a relative capture path or an absolute
    // loopback URL. URL() supports both without producing a malformed double
    // host such as http://127.0.0.1:8787http://127.0.0.1:8787/....
    return { ...result, url: new URL(result.url, `${localHardwareAgentUrl}/`).toString() };
  }
  return tetherRequest('/api/dslr/capture', {
    method: 'POST',
    body: JSON.stringify({ port }),
  });
}

export async function listHardwarePrinters() {
  if (localHardwareAgentUrl) return localAgentRequest('/api/printers');
  return tetherRequest('/api/printers');
}

export async function queueHardwarePrint({ printerName, imageUrl, copies = 1 }) {
  const payload = { printerName, imageUrl, copies };
  if (localHardwareAgentUrl) return localAgentRequest('/api/prints', { method: 'POST', body: JSON.stringify(payload) });
  return tetherRequest('/api/prints', { method: 'POST', body: JSON.stringify(payload) });
}
