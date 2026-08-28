import { describe, expect, it } from 'vitest';
import { autoDiscovery, AutoDiscoveryAction } from './cs-api';

const jsonResponse = (status: number, body: unknown): typeof fetch =>
  (() =>
    Promise.resolve({
      status,
      json: () => Promise.resolve(body),
    })) as unknown as typeof fetch;

describe('autoDiscovery', () => {
  it('uses the discovered base_url', async () => {
    const request = jsonResponse(200, {
      'm.homeserver': { base_url: 'https://matrix.example.com/' },
    });

    const [err, info] = await autoDiscovery(request, 'example.com');

    expect(err).toBeUndefined();
    expect(info?.['m.homeserver'].base_url).toBe('https://matrix.example.com');
  });

  it('falls back to the given host when well-known is missing', async () => {
    const request = jsonResponse(404, undefined);

    const [err, info] = await autoDiscovery(request, 'example.com');

    expect(err).toBeUndefined();
    expect(info?.['m.homeserver'].base_url).toBe('https://example.com');
  });

  it('falls back to the given host when well-known has no m.homeserver', async () => {
    const request = jsonResponse(200, {
      'm.identity_server': { base_url: 'https://vector.im' },
      'org.matrix.msc4143.rtc_foci': [
        { type: 'livekit', livekit_service_url: 'https://livekit.example.com' },
      ],
    });

    const [err, info] = await autoDiscovery(request, 'example.com');

    expect(err).toBeUndefined();
    expect(info?.['m.homeserver'].base_url).toBe('https://example.com');
    expect(info?.['org.matrix.msc4143.rtc_foci']).toHaveLength(1);
  });

  it('falls back to the given host when m.homeserver has no base_url', async () => {
    const request = jsonResponse(200, { 'm.homeserver': {} });

    const [err, info] = await autoDiscovery(request, 'https://matrix.example.com/');

    expect(err).toBeUndefined();
    expect(info?.['m.homeserver'].base_url).toBe('https://matrix.example.com');
  });

  it('prompts when well-known responds with an error status', async () => {
    const request = jsonResponse(500, undefined);

    const [err] = await autoDiscovery(request, 'example.com');

    expect(err?.action).toBe(AutoDiscoveryAction.FAIL_PROMPT);
  });

  it('errors when the discovered base_url has no scheme', async () => {
    const request = jsonResponse(200, { 'm.homeserver': { base_url: 'matrix.example.com' } });

    const [err] = await autoDiscovery(request, 'example.com');

    expect(err?.action).toBe(AutoDiscoveryAction.FAIL_ERROR);
  });
});
