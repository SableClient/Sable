export const NATIVE_EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

export function getTranslateX(element: HTMLElement, fallback = 0) {
  const transform = window.getComputedStyle(element).transform;
  if (!transform || transform === 'none') return fallback;

  const values = transform.slice(transform.indexOf('(') + 1, -1).split(',');
  const index = transform.startsWith('matrix3d') ? 12 : 4;
  const value = Number.parseFloat(values[index] ?? '');
  return Number.isFinite(value) ? value : fallback;
}

export function setTranslateX(element: HTMLElement, value: number) {
  element.style.transform = `translate3d(${value}px, 0, 0)`;
}

/** Applies a CSS transition and returns a handle that cancels its completion callback. */
export function transitionTo(
  element: HTMLElement,
  transition: string,
  apply: () => void,
  durationMs: number,
  onComplete?: () => void
) {
  let cancelled = false;
  let timer: number | undefined;

  const finish = () => {
    if (cancelled) return;
    cancelled = true;
    if (timer !== undefined) window.clearTimeout(timer);
    onComplete?.();
  };

  if (durationMs <= 0) {
    element.style.transition = 'none';
    apply();
    finish();
    return { cancel: () => undefined };
  }

  element.style.transition = transition;
  apply();
  timer = window.setTimeout(finish, durationMs);

  return {
    cancel: () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    },
  };
}
