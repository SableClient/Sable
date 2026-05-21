export const scheduleDeferredFeatureMount = (mount: () => void): (() => void) => {
  const win = window as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  let timeoutId: number | undefined;
  let idleId: number | undefined;

  const runMount = () => {
    mount();
  };

  if (typeof win.requestIdleCallback === 'function') {
    idleId = win.requestIdleCallback(runMount, { timeout: 1200 });
  } else {
    timeoutId = win.setTimeout(runMount, 0);
  }

  return () => {
    if (idleId !== undefined && typeof win.cancelIdleCallback === 'function') {
      win.cancelIdleCallback(idleId);
    }
    if (timeoutId !== undefined) {
      win.clearTimeout(timeoutId);
    }
  };
};
