const SLIDING_SYNC_LOGIN_KEY = 'sable.login.slidingSync';

export const getPendingSlidingSyncLogin = (): boolean => {
  try {
    return globalThis.sessionStorage?.getItem(SLIDING_SYNC_LOGIN_KEY) === 'true';
  } catch {
    return false;
  }
};

export const setPendingSlidingSyncLogin = (enabled: boolean): void => {
  try {
    globalThis.sessionStorage?.setItem(SLIDING_SYNC_LOGIN_KEY, String(enabled));
  } catch {
    // Storage can be disabled for this origin.
  }
};

export const clearPendingSlidingSyncLogin = (): void => {
  try {
    globalThis.sessionStorage?.removeItem(SLIDING_SYNC_LOGIN_KEY);
  } catch {
    // Storage can be disabled for this origin.
  }
};
