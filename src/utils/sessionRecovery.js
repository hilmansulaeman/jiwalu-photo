const RECOVERY_KEY = 'jiwaluphoto_last_recovery_session';
const RECOVERY_HISTORY_KEY = 'jiwaluphoto_recovery_history';
const MAX_RECOVERY_HISTORY = 10;

const getSessionKey = (session = {}) => (
  session?.backendSessionId ||
  session?.localGalleryId ||
  session?.id ||
  ''
);

const readHistory = () => {
  try {
    const raw = window.localStorage.getItem(RECOVERY_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (err) {
    console.error('Failed to read recovery history', err);
    return [];
  }
};

const writeHistory = (history = []) => {
  const cleanHistory = history
    .filter(Boolean)
    .slice(0, MAX_RECOVERY_HISTORY);
  const limits = [MAX_RECOVERY_HISTORY, 8, 5, 3, 1];

  for (const limit of limits) {
    try {
      window.localStorage.setItem(RECOVERY_HISTORY_KEY, JSON.stringify(cleanHistory.slice(0, limit)));
      return true;
    } catch (err) {
      if (limit === 1) {
        console.error('Failed to save recovery history', err);
      }
    }
  }
  return false;
};

export function saveRecoverySession(session) {
  try {
    const existingRaw = window.localStorage.getItem(RECOVERY_KEY);
    const existing = existingRaw ? JSON.parse(existingRaw) : {};
    const nextSession = {
      ...existing,
      ...session,
      createdAt: session.createdAt || existing.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(RECOVERY_KEY, JSON.stringify(nextSession));

    const sessionKey = getSessionKey(nextSession);
    const history = readHistory();
    const nextHistory = [
      nextSession,
      ...history.filter(item => getSessionKey(item) !== sessionKey),
    ].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    writeHistory(nextHistory);
    return true;
  } catch (err) {
    console.error('Failed to save recovery session', err);
    return false;
  }
}

export function getRecoverySession() {
  try {
    const raw = window.localStorage.getItem(RECOVERY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('Failed to read recovery session', err);
    return null;
  }
}

export function getRecoveryHistory() {
  const history = readHistory();
  const last = getRecoverySession();
  const merged = last ? [last, ...history] : history;
  const seen = new Set();

  return merged
    .filter((session) => {
      const key = getSessionKey(session);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    .slice(0, MAX_RECOVERY_HISTORY);
}

export function removeRecoverySession(sessionId) {
  try {
    const history = readHistory().filter(session => getSessionKey(session) !== sessionId);
    writeHistory(history);

    const current = getRecoverySession();
    if (!sessionId || getSessionKey(current || {}) === sessionId) {
      window.localStorage.removeItem(RECOVERY_KEY);
    }
    return true;
  } catch (err) {
    console.error('Failed to remove recovery session', err);
    return false;
  }
}

export function clearRecoverySession() {
  try {
    window.localStorage.removeItem(RECOVERY_KEY);
    return true;
  } catch (err) {
    console.error('Failed to clear recovery session', err);
    return false;
  }
}

export function clearRecoveryHistory() {
  try {
    window.localStorage.removeItem(RECOVERY_KEY);
    window.localStorage.removeItem(RECOVERY_HISTORY_KEY);
    return true;
  } catch (err) {
    console.error('Failed to clear recovery history', err);
    return false;
  }
}
