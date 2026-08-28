import type { ReactNode } from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import type { AutoDiscoveryInfo } from '../cs-api';
import { MatrixClientProvider } from './useMatrixClient';
import { AutoDiscoveryInfoProvider } from './useAutoDiscoveryInfo';
import { useLivekitSupport } from './useLivekitSupport';

const wellKnownWithFocus = {
  'org.matrix.msc4143.rtc_foci': [{ type: 'livekit', livekit_service_url: 'https://sfu.example' }],
} as unknown as AutoDiscoveryInfo;

const wellKnownWithoutFocus = {} as unknown as AutoDiscoveryInfo;

const makeClient = (getTransports: () => Promise<unknown>): MatrixClient =>
  ({ _unstable_getRTCTransports: getTransports }) as unknown as MatrixClient;

const renderSupport = (
  mx: MatrixClient,
  autoDiscoveryInfo: AutoDiscoveryInfo
): (() => boolean | undefined) => {
  let latest: boolean | undefined;
  function Probe() {
    latest = useLivekitSupport();
    return null;
  }
  const wrapper = ({ children }: { children?: ReactNode }) => (
    <MatrixClientProvider value={mx}>
      <AutoDiscoveryInfoProvider value={autoDiscoveryInfo}>{children}</AutoDiscoveryInfoProvider>
    </MatrixClientProvider>
  );
  render(<Probe />, { wrapper });
  return () => latest;
};

describe('useLivekitSupport', () => {
  it('accepts a transport advertised by the homeserver', async () => {
    const mx = makeClient(() =>
      Promise.resolve([{ type: 'livekit', livekit_service_url: 'https://sfu.example' }])
    );
    const latest = renderSupport(mx, wellKnownWithoutFocus);

    await waitFor(() => expect(latest()).toBe(true));
  });

  it('falls back to the legacy well-known focus', async () => {
    const mx = makeClient(() => Promise.reject(new Error('M_NOT_FOUND')));
    const latest = renderSupport(mx, wellKnownWithFocus);

    await waitFor(() => expect(latest()).toBe(true));
  });

  it('reports no support when neither source advertises a livekit transport', async () => {
    const mx = makeClient(() => Promise.resolve([{ type: 'not-livekit' }]));
    const latest = renderSupport(mx, wellKnownWithoutFocus);

    await waitFor(() => expect(latest()).toBe(false));
  });

  it('does not report unavailable while the homeserver probe is in flight', () => {
    const mx = makeClient(() => new Promise<unknown>(() => {}));
    const latest = renderSupport(mx, wellKnownWithFocus);

    expect(latest()).toBe(true);
  });

  it('probes the homeserver once per client', async () => {
    const getTransports = vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]);
    const mx = { _unstable_getRTCTransports: getTransports } as unknown as MatrixClient;

    renderSupport(mx, wellKnownWithoutFocus);
    renderSupport(mx, wellKnownWithoutFocus);

    await waitFor(() => expect(getTransports).toHaveBeenCalledOnce());
  });
});
