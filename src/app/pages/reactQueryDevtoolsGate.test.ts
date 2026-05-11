import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isReactQueryDevtoolsEnabled,
  REACT_QUERY_DEVTOOLS_LOCAL_STORAGE_KEY,
} from './reactQueryDevtoolsGate';

describe('reactQueryDevtoolsGate', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  it('is disabled by default even in development', () => {
    vi.stubEnv('VITE_ENABLE_REACT_QUERY_DEVTOOLS', 'false');

    expect(isReactQueryDevtoolsEnabled()).toBe(false);
  });

  it('is enabled by the env variable', () => {
    vi.stubEnv('VITE_ENABLE_REACT_QUERY_DEVTOOLS', 'true');

    expect(isReactQueryDevtoolsEnabled()).toBe(true);
  });

  it('is enabled by the local storage flag', () => {
    vi.stubEnv('VITE_ENABLE_REACT_QUERY_DEVTOOLS', 'false');
    localStorage.setItem(REACT_QUERY_DEVTOOLS_LOCAL_STORAGE_KEY, '1');

    expect(isReactQueryDevtoolsEnabled()).toBe(true);
  });
});
