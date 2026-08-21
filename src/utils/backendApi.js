import { getConfiguredBackendApiUrl } from './kioskConfig.js';

const useSameOriginBackend = import.meta.env.VITE_KIOSK_SAME_ORIGIN === 'true';
const sameOriginBackend = typeof window !== 'undefined' ? window.location.origin : '';
const isLocalHost = (url = '') => /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(url);
const isPublicHTTPSPage = typeof window !== 'undefined'
  && window.location.protocol === 'https:'
  && !isLocalHost(window.location.origin);

// The kiosk build is served by the local Go backend. Using its current origin
// also makes a HTTPS tunnel work from phones and tablets: requests travel back
// through the tunnel instead of incorrectly targeting that device's localhost.
export const BACKEND_API_URL = (
  (useSameOriginBackend && sameOriginBackend)
  || import.meta.env.VITE_BACKEND_API_URL
  || (isPublicHTTPSPage ? 'https://jiwaluphoto-backend-staging.vercel.app' : 'http://localhost:8788')
).replace(/\/$/, '');

export function getBackendApiUrl() {
  const configured = getConfiguredBackendApiUrl('');
  // A kiosk can intentionally use localhost. A public HTTPS deployment cannot:
  // that would point to the visitor's device and trigger mixed-content/CORS errors.
  if (configured && !(isPublicHTTPSPage && isLocalHost(configured))) return configured;
  return BACKEND_API_URL;
}

export async function backendRequest(path, token, options = {}) {
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.sessionToken ? { 'x-session-token': options.sessionToken } : {}),
    ...(options.headers || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${getBackendApiUrl()}${path}`, {
    ...options,
    headers,
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('backend:unauthorized', { detail: { path } }));
    }
    throw error;
  }
  return payload?.data ?? payload;
}

export async function reportMonitoringError({ category, sessionId = '', message = '', source = 'client', metadata = {} } = {}) {
  try {
    await backendRequest('/api/events/errors', null, {
      method: 'POST',
      body: JSON.stringify({ category, sessionId, message, source, metadata }),
    });
  } catch (err) {
    console.warn('Failed to report monitoring error:', err);
  }
}

export function formatCurrency(value) {
  return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
}

export function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('id-ID');
}
