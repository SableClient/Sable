import '@testing-library/jest-dom';

class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = globalThis.ResizeObserver ?? ResizeObserverPolyfill;

class IntersectionObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.IntersectionObserver =
  globalThis.IntersectionObserver ??
  (IntersectionObserverPolyfill as unknown as typeof IntersectionObserver);
