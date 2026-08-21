import { getBackendApiUrl } from './backendApi.js';

const STORAGE_KEY = 'potobox_kiosk_settings';

export const defaultSettings = {
  boothId: '',
  kioskName: 'Urbanmenphoto Booth',
  eventName: '',
  boothLocation: '',
  operatorName: '',
  publicFrontendUrl: '',
  publicGalleryBaseUrl: '',
  backendApiUrl: '',
  defaultCamera: 'user', // 'user' (front) or 'environment' (rear)
  cameraDeviceId: '',
  cameraDeviceLabel: '',
  mirrorCamera: true,
  // Each position is a physical camera. deviceId is supplied by the browser.
  // Camera 1 is kept compatible with the previous single-camera setup.
  cameraProfiles: [],
  idleTimeout: 60, // in seconds
  autoPrintEnabled: false,
  printMode: 'hardware_agent',
  printDelaySeconds: 1.5,
  printerName: '',
  printNote: ''
};

const createLegacyCameraProfiles = (settings = {}) => ([
  {
    id: 'camera-1',
    name: 'Cam 1 (Normal Angle)',
    deviceId: settings.cameraDeviceId || '',
    deviceLabel: settings.cameraDeviceLabel || '',
    captureMode: 'webcam',
    tetherPort: '',
    facingMode: settings.defaultCamera || 'user',
    mirror: settings.mirrorCamera !== false,
    enabled: true,
  },
  {
    id: 'camera-2',
    name: 'Cam 2 (Wide Angle)',
    deviceId: '',
    deviceLabel: '',
    captureMode: 'webcam',
    tetherPort: '',
    facingMode: 'environment',
    mirror: false,
    enabled: false,
  },
]);

export const normalizeCameraProfiles = (settings = {}) => {
  const source = Array.isArray(settings.cameraProfiles) && settings.cameraProfiles.length
    ? settings.cameraProfiles
    : createLegacyCameraProfiles(settings);

  return ['camera-1', 'camera-2'].map((id, index) => {
    const profile = source.find(item => item?.id === id) || source[index] || {};
    return {
      id,
      name: profile.name || (index === 0 ? 'Cam 1 (Normal Angle)' : 'Cam 2 (Wide Angle)'),
      deviceId: profile.deviceId || '',
      deviceLabel: profile.deviceLabel || '',
      // Allow dynamic captureMode (webcam or dslr). Defaults to dslr for compatibility.
      captureMode: profile.captureMode || 'dslr',
      tetherPort: (profile.captureMode || 'dslr') === 'dslr' ? (profile.tetherPort || '') : '',
      facingMode: profile.facingMode || (index === 0 ? settings.defaultCamera || 'user' : 'environment'),
      mirror: typeof profile.mirror === 'boolean' ? profile.mirror : index === 0 ? settings.mirrorCamera !== false : false,
      enabled: true, // Forcibly enabled both cameras for now
    };
  });
};

const createBoothId = () => `booth-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const trimTrailingSlash = (value = '') => String(value || '').trim().replace(/\/$/, '');

export function getKioskSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const settings = { ...defaultSettings, ...JSON.parse(stored) };
      return { ...settings, boothId: settings.boothId || createBoothId(), cameraProfiles: normalizeCameraProfiles(settings) };
    }
  } catch (e) {
    console.error('Failed to read kiosk settings', e);
  }
  return { ...defaultSettings, boothId: createBoothId(), cameraProfiles: normalizeCameraProfiles(defaultSettings) };
}

export function getCameraProfiles(settings = getKioskSettings()) {
  return normalizeCameraProfiles(settings).filter(profile => profile.enabled);
}

export function saveKioskSettings(settings) {
  try {
    const cameraProfiles = normalizeCameraProfiles(settings);
    const firstCamera = cameraProfiles[0];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...settings,
      cameraProfiles,
      printMode: 'hardware_agent',
      // Preserve these legacy fields for existing kiosk configurations.
      cameraDeviceId: firstCamera.deviceId,
      cameraDeviceLabel: firstCamera.deviceLabel,
      defaultCamera: firstCamera.facingMode,
      mirrorCamera: firstCamera.mirror,
      boothId: settings.boothId || createBoothId(),
      publicFrontendUrl: trimTrailingSlash(settings.publicFrontendUrl),
      publicGalleryBaseUrl: trimTrailingSlash(settings.publicGalleryBaseUrl),
      backendApiUrl: trimTrailingSlash(settings.backendApiUrl),
    }));
    saveKioskSettingsToServer(settings);
    return true;
  } catch (e) {
    console.error('Failed to save kiosk settings', e);
    return false;
  }
}

export function getPublicGalleryBaseUrl(settings = getKioskSettings()) {
  const configured = trimTrailingSlash(settings.publicGalleryBaseUrl || settings.publicFrontendUrl);
  if (configured) return configured;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export function getConfiguredBackendApiUrl(fallback = '') {
  const configured = trimTrailingSlash(getKioskSettings().backendApiUrl);
  return configured || trimTrailingSlash(fallback);
}


export function getActiveProjectId() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('jiwaluphoto_kiosk_project_id') || null;
}

export function setActiveProjectId(id) {
  if (typeof window === 'undefined') return;
  if (id) {
    localStorage.setItem('jiwaluphoto_kiosk_project_id', id);
  } else {
    localStorage.removeItem('jiwaluphoto_kiosk_project_id');
  }
}

export async function syncKioskSettings() {
  try {
    const projectId = getActiveProjectId();
    const url = projectId ? `${getBackendApiUrl()}/api/settings?projectId=${projectId}` : `${getBackendApiUrl()}/api/settings`;
    const res = await fetch(url);
    if (res.ok) {
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        if (json && json.data && Object.keys(json.data).length > 0) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(json.data));
        }
      } catch (e) {
        console.warn('API returned invalid JSON:', text.substring(0, 100));
      }
    }
  } catch (err) {
    console.error('Failed to sync settings from server', err);
  }
}

export async function saveKioskSettingsToServer(settings) {
  try {
    const projectId = getActiveProjectId();
    const url = projectId ? `${getBackendApiUrl()}/api/settings?projectId=${projectId}` : `${getBackendApiUrl()}/api/settings`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    if (!res.ok) throw new Error('Failed to save to server');
  } catch (err) {
    console.error(err);
  }
}
