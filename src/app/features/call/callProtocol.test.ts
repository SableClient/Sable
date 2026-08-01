import { describe, expect, it } from 'vitest';
import type { IOpenIDToken } from '$types/matrix-sdk';
import { advertiseCallTransport, buildProvisioningRequest, callMemberId } from './callProtocol';

const openidToken: IOpenIDToken = {
  access_token: 'openid-secret',
  token_type: 'Bearer',
  matrix_server_name: 'example.org',
  expires_in: 3600,
};

describe('callProtocol', () => {
  it('derives the legacy LiveKit identity', () => {
    expect(callMemberId('@alice:example.org', 'DEVICE')).toBe('@alice:example.org:DEVICE');
  });

  it('builds the legacy provisioning request', () => {
    const request = buildProvisioningRequest({
      serviceUrl: 'https://sfu.example',
      roomId: '!room:example.org',
      deviceId: 'DEVICE',
      openidToken,
    });

    expect(request.url).toBe('https://sfu.example/sfu/get');
    expect(request.body).toEqual({
      room: '!room:example.org',
      openid_token: openidToken,
      device_id: 'DEVICE',
    });
  });

  it('advertises the transport with the alias legacy Element Call reads', () => {
    expect(
      advertiseCallTransport(
        { type: 'livekit', livekit_service_url: 'https://sfu.example' },
        '!room:example.org'
      )
    ).toEqual({
      type: 'livekit',
      livekit_service_url: 'https://sfu.example',
      livekit_alias: '!room:example.org',
    });
  });

  it('lets the transport keep an alias it already advertises', () => {
    expect(
      advertiseCallTransport(
        {
          type: 'livekit',
          livekit_service_url: 'https://sfu.example',
          livekit_alias: '!other:example.org',
        },
        '!room:example.org'
      ).livekit_alias
    ).toBe('!other:example.org');
  });
});
