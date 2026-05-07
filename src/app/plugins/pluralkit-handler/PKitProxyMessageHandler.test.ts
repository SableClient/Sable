import type { Mock } from 'vitest';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { PKitProxyMessageHandler } from './PKitProxyMessageHandler';
import type { MatrixClient } from '$types/matrix-sdk';

// Mock the hook module that provides proxy associations + profile lookup
vi.mock('$hooks/usePerMessageProfile', () => ({
  getAllPerMessageProfileProxies: vi.fn<() => Promise<unknown[]>>(),
  getPerMessageProfileById: vi.fn<() => Promise<unknown>>(),
  parsePerMessageProfileProxyAssociation: vi.fn<() => unknown>(),
}));

const mocked = await import('$hooks/usePerMessageProfile');

describe('PKitProxyMessageHandler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns false for isAProxiedMessage before init', () => {
    const handler = new PKitProxyMessageHandler({} as unknown as MatrixClient);
    expect(handler.isAProxiedMessage('[test] hi')).toBe(false);
  });

  it('matches a proxied message, returns pmp, and strips content', async () => {
    const proxyRegex = /^\[(.+)\]$/;

    (mocked.getAllPerMessageProfileProxies as unknown as Mock).mockResolvedValueOnce([
      { profileId: 'p1', regexString: proxyRegex.toString() },
    ]);
    (mocked.parsePerMessageProfileProxyAssociation as unknown as Mock).mockReturnValueOnce({
      profileId: 'p1',
      regex: proxyRegex,
    });
    (mocked.getPerMessageProfileById as unknown as Mock).mockResolvedValueOnce({
      id: 'p1',
      name: 'Test',
    });

    const handler = new PKitProxyMessageHandler({} as unknown as MatrixClient);

    const pmp = await handler.getPmpBasedOnMessage('[hello]');
    expect(pmp).toEqual({ id: 'p1', name: 'Test' });

    // getPmpBasedOnMessage refreshes/init() so we should be inited now
    expect(handler.isAProxiedMessage('[hello]')).toBe(true);
    expect(handler.stripProxyFromMessage('[hello]')).toBe('hello');
  });
});
