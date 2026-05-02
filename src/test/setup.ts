import '@testing-library/jest-dom';

// Node.js 22+ ships a built-in `localStorage` stub that throws for getItem/setItem
// unless --localstorage-file is supplied at startup. jsdom relies on being able to
// define window.localStorage, but Node's version can prevent that.  We install an
// in-memory implementation unconditionally so every test environment starts with a
// working, isolated localStorage regardless of runtime version.
const _store = new Map<string, string>();
const _localStorage = {
  getItem: (key: string): string | null => _store.get(key) ?? null,
  setItem: (key: string, value: string): void => {
    _store.set(key, value);
  },
  removeItem: (key: string): void => {
    _store.delete(key);
  },
  clear: (): void => {
    _store.clear();
  },
  get length(): number {
    return _store.size;
  },
  key: (index: number): string | null => [..._store.keys()][index] ?? null,
};
Object.defineProperty(globalThis, 'localStorage', {
  value: _localStorage,
  writable: true,
  configurable: true,
});
