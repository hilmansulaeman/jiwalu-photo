const STORAGE_KEY = 'potobox_frame_settings';

const defaultSettings = {
  brandLine1: 'Urbanmen',
  brandLine2: 'Photo Booth',
  showDate: true
};

export function getFrameSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('Failed to read frame settings', e);
  }
  return defaultSettings;
}

export function saveFrameSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch (e) {
    console.error('Failed to save frame settings', e);
    return false;
  }
}
