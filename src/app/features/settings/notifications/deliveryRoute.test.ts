import { describe, expect, it } from 'vitest';
import { deliveryRouteDetail, deliveryRouteSummary, describeDeliveryRoute } from './deliveryRoute';

const HOMESERVER = 'https://matrix.example.org';

describe('describeDeliveryRoute', () => {
  it('names the homeserver as packager when it sends web push itself', () => {
    const route = describeDeliveryRoute({
      homeserverUrl: HOMESERVER,
      serverSendsWebPush: true,
      endpoint: 'https://ntfy.sh/upabc',
    });

    expect(deliveryRouteSummary(route)).toBe('Your homeserver → ntfy.sh');
    expect(route.encrypted).toBe(true);
    expect(route.external).toEqual(['ntfy.sh']);
  });

  it('says a relay cannot read an encrypted push', () => {
    const route = describeDeliveryRoute({
      homeserverUrl: HOMESERVER,
      serverSendsWebPush: true,
      endpoint: 'https://ntfy.sh/upabc',
    });

    expect(deliveryRouteDetail(route)).toContain('cannot read it');
  });

  it('warns that a gateway can read an unencrypted push', () => {
    const route = describeDeliveryRoute({
      homeserverUrl: HOMESERVER,
      serverSendsWebPush: false,
      gatewayUrl: 'https://matrix.gateway.unifiedpush.org/_matrix/push/v1/notify',
      endpoint: 'https://ntfy.sh/upabc',
    });

    expect(deliveryRouteSummary(route)).toBe('matrix.gateway.unifiedpush.org → ntfy.sh');
    expect(route.external).toEqual(['matrix.gateway.unifiedpush.org', 'ntfy.sh']);
    expect(deliveryRouteDetail(route)).toContain('can read what it contains');
  });

  it('reports nothing external when every hop is the homeserver', () => {
    const route = describeDeliveryRoute({
      homeserverUrl: HOMESERVER,
      serverSendsWebPush: false,
      gatewayUrl: `${HOMESERVER}/_matrix/push/v1/notify`,
      endpoint: `${HOMESERVER}/upabc`,
    });

    expect(route.external).toEqual([]);
    expect(deliveryRouteDetail(route)).toBe('Every hop runs on your own infrastructure.');
  });

  it('names Google rather than its hostname', () => {
    const route = describeDeliveryRoute({
      homeserverUrl: HOMESERVER,
      serverSendsWebPush: true,
      endpoint: 'https://fcm.googleapis.com/fcm/send/token',
    });

    expect(deliveryRouteSummary(route)).toBe('Your homeserver → Google');
  });

  it('marks the in-app socket so the user knows no other app is involved', () => {
    const route = describeDeliveryRoute({
      homeserverUrl: HOMESERVER,
      serverSendsWebPush: true,
      endpoint: 'https://ntfy.sh/upabc',
      embedded: true,
    });

    expect(deliveryRouteSummary(route)).toBe('Your homeserver → ntfy.sh (this app)');
  });

  it('does not repeat a host that is both gateway and endpoint', () => {
    const route = describeDeliveryRoute({
      homeserverUrl: HOMESERVER,
      serverSendsWebPush: false,
      gatewayUrl: 'https://ntfy.sh/_matrix/push/v1/notify',
      endpoint: 'https://ntfy.sh/upabc',
    });

    expect(route.external).toEqual(['ntfy.sh']);
  });
});
