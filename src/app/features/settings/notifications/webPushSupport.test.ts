import { describe, expect, it, vi } from 'vitest';
import { getWebPushServerSupport } from './webPushSupport';

const VAPID =
  'BNbXV88MfMI0fSxB7cDngopoviZRTbxIS0qSS-O7BZCtG04khMOn-PP2uez_X7Aeci42n02kJ0-JJJ0uQ4ELRTs';

type SupportMocks = {
  versionsAdvertised?: boolean;
  versionsError?: Error;
  capabilities?: Record<string, unknown>;
  capabilitiesError?: Error;
};

function createMatrixClient({
  versionsAdvertised = false,
  versionsError,
  capabilities = {},
  capabilitiesError,
}: SupportMocks = {}) {
  return {
    doesServerSupportUnstableFeature: vi.fn<(feature: string) => Promise<boolean>>(
      async (feature: string) => {
        if (feature !== 'org.matrix.msc4174') return false;
        if (versionsError) throw versionsError;
        return versionsAdvertised;
      }
    ),
    getCapabilities: vi.fn<() => Promise<Record<string, unknown>>>(async () => {
      if (capabilitiesError) throw capabilitiesError;
      return capabilities;
    }),
  };
}

describe('getWebPushServerSupport', () => {
  it('reports unsupported when /versions does not advertise MSC4174', async () => {
    const mx = createMatrixClient({ versionsAdvertised: false });

    await expect(getWebPushServerSupport(mx as never)).resolves.toEqual({ supported: false });
    expect(mx.getCapabilities).not.toHaveBeenCalled();
  });

  it('reports unsupported when the /versions check fails', async () => {
    const mx = createMatrixClient({ versionsError: new Error('network down') });

    await expect(getWebPushServerSupport(mx as never)).resolves.toEqual({ supported: false });
  });

  it('returns the VAPID key from the stable capability', async () => {
    const mx = createMatrixClient({
      versionsAdvertised: true,
      capabilities: { 'm.webpush': { enabled: true, vapid: VAPID } },
    });

    await expect(getWebPushServerSupport(mx as never)).resolves.toEqual({
      supported: true,
      vapidPublicKey: VAPID,
    });
  });

  it('returns the VAPID key from the unstable capability', async () => {
    const mx = createMatrixClient({
      versionsAdvertised: true,
      capabilities: { 'org.matrix.msc4174.webpush': { enabled: true, vapid: VAPID } },
    });

    await expect(getWebPushServerSupport(mx as never)).resolves.toEqual({
      supported: true,
      vapidPublicKey: VAPID,
    });
  });

  it('prefers the stable capability over the unstable one', async () => {
    const mx = createMatrixClient({
      versionsAdvertised: true,
      capabilities: {
        'm.webpush': { enabled: true, vapid: VAPID },
        'org.matrix.msc4174.webpush': { enabled: true, vapid: 'unstable-key' },
      },
    });

    await expect(getWebPushServerSupport(mx as never)).resolves.toEqual({
      supported: true,
      vapidPublicKey: VAPID,
    });
  });

  it('reports unsupported when the capability is not enabled', async () => {
    const mx = createMatrixClient({
      versionsAdvertised: true,
      capabilities: { 'm.webpush': { enabled: false, vapid: VAPID } },
    });

    await expect(getWebPushServerSupport(mx as never)).resolves.toEqual({ supported: false });
  });

  it('reports unsupported when the capability has no VAPID key', async () => {
    const mx = createMatrixClient({
      versionsAdvertised: true,
      capabilities: { 'm.webpush': { enabled: true } },
    });

    await expect(getWebPushServerSupport(mx as never)).resolves.toEqual({ supported: false });
  });

  it('reports unsupported when fetching capabilities fails', async () => {
    const mx = createMatrixClient({
      versionsAdvertised: true,
      capabilitiesError: new Error('no capabilities'),
    });

    await expect(getWebPushServerSupport(mx as never)).resolves.toEqual({ supported: false });
  });
});
