import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import { getWebPushPusherState, healDormantWebPushPusher } from './webPushActivation';

const KIND = 'org.matrix.msc4174.webpush';
const APP_ID = 'moe.sable.app.sygnal';

const clientWith = (pushers: unknown[]) =>
  ({
    getPushers: vi.fn<() => Promise<unknown>>(async () => ({ pushers })),
  }) as unknown as MatrixClient;

describe('getWebPushPusherState', () => {
  it('reports a pusher the server has not activated', async () => {
    const mx = clientWith([{ kind: KIND, app_id: APP_ID, activated: false }]);

    await expect(getWebPushPusherState(mx, APP_ID)).resolves.toBe('dormant');
  });

  it('reports an activated pusher', async () => {
    const mx = clientWith([{ kind: KIND, app_id: APP_ID, activated: true }]);

    await expect(getWebPushPusherState(mx, APP_ID)).resolves.toBe('activated');
  });

  it('reports absent when no webpush pusher exists for this app', async () => {
    const mx = clientWith([
      { kind: 'http', app_id: APP_ID, activated: false },
      { kind: KIND, app_id: 'someone.else', activated: false },
    ]);

    await expect(getWebPushPusherState(mx, APP_ID)).resolves.toBe('absent');
  });

  // Servers predating the field would otherwise be re-registered on every start.
  it('does not treat a missing activated field as dormant', async () => {
    const mx = clientWith([{ kind: KIND, app_id: APP_ID }]);

    await expect(getWebPushPusherState(mx, APP_ID)).resolves.toBe('activated');
  });
});

describe('healDormantWebPushPusher', () => {
  /**
   * The validation push is one-shot and the server never resends, so a pusher that went
   * dormant stays dormant until the client asks for a new one.
   */
  it('re-registers a dormant pusher so a fresh validation push is sent', async () => {
    const mx = clientWith([{ kind: KIND, app_id: APP_ID, activated: false }]);
    const reRegister = vi.fn<() => Promise<void>>(async () => undefined);

    await expect(healDormantWebPushPusher(mx, APP_ID, reRegister)).resolves.toBe(true);
    expect(reRegister).toHaveBeenCalledOnce();
  });

  it('leaves a working pusher alone', async () => {
    const mx = clientWith([{ kind: KIND, app_id: APP_ID, activated: true }]);
    const reRegister = vi.fn<() => Promise<void>>(async () => undefined);

    await expect(healDormantWebPushPusher(mx, APP_ID, reRegister)).resolves.toBe(false);
    expect(reRegister).not.toHaveBeenCalled();
  });

  it('does not register when there is no pusher to heal', async () => {
    const mx = clientWith([]);
    const reRegister = vi.fn<() => Promise<void>>(async () => undefined);

    await expect(healDormantWebPushPusher(mx, APP_ID, reRegister)).resolves.toBe(false);
    expect(reRegister).not.toHaveBeenCalled();
  });
});
