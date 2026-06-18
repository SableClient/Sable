/**
 * Integration tests: exercises the full config-load → setMatrixToBase → URL
 * generation pipeline that App.tsx runs on startup.
 *
 * The pattern under test mirrors App.tsx:
 *   <ClientConfigLoader>
 *     {(config) => { setMatrixToBase(config.matrixToBaseUrl); ... }}
 *   </ClientConfigLoader>
 *
 * We mock fetch so we don't need a real config.json or a live matrix.to instance.
 */
/* oxlint-disable vitest/require-mock-type-parameters */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { setMatrixToBase, getMatrixToRoom, getMatrixToUser } from '$plugins/matrix-to';
import { buildConfigAttemptUrl, ClientConfigLoader, getClientConfig } from './ClientConfigLoader';

afterEach(() => {
  setMatrixToBase(); // reset module state to 'https://matrix.to'
  vi.unstubAllGlobals();
});

const mockFetch = (config: object) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve(config),
    })
  );

describe('ClientConfigLoader + matrix-to wiring', () => {
  it('generates a standard matrix.to URL when no custom base is configured', async () => {
    mockFetch({});

    render(
      <ClientConfigLoader>
        {(config) => {
          setMatrixToBase(config.matrixToBaseUrl);
          return <span data-testid="link">{getMatrixToRoom('!room:example.com')}</span>;
        }}
      </ClientConfigLoader>
    );

    await waitFor(() =>
      expect(screen.getByTestId('link')).toHaveTextContent('https://matrix.to/#/!room:example.com')
    );
  });

  it('generates a custom-base URL for rooms when matrixToBaseUrl is set', async () => {
    mockFetch({ matrixToBaseUrl: 'https://custom.example.org' });

    render(
      <ClientConfigLoader>
        {(config) => {
          setMatrixToBase(config.matrixToBaseUrl);
          return <span data-testid="link">{getMatrixToRoom('!room:example.com')}</span>;
        }}
      </ClientConfigLoader>
    );

    await waitFor(() =>
      expect(screen.getByTestId('link')).toHaveTextContent(
        'https://custom.example.org/#/!room:example.com'
      )
    );
  });

  it('generates a custom-base URL for users when matrixToBaseUrl is set', async () => {
    mockFetch({ matrixToBaseUrl: 'https://custom.example.org' });

    render(
      <ClientConfigLoader>
        {(config) => {
          setMatrixToBase(config.matrixToBaseUrl);
          return <span data-testid="user">{getMatrixToUser('@alice:example.com')}</span>;
        }}
      </ClientConfigLoader>
    );

    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(
        'https://custom.example.org/#/@alice:example.com'
      )
    );
  });

  it('strips a trailing slash from matrixToBaseUrl', async () => {
    mockFetch({ matrixToBaseUrl: 'https://custom.example.org/' });

    render(
      <ClientConfigLoader>
        {(config) => {
          setMatrixToBase(config.matrixToBaseUrl);
          return <span data-testid="link">{getMatrixToRoom('!room:example.com')}</span>;
        }}
      </ClientConfigLoader>
    );

    await waitFor(() =>
      expect(screen.getByTestId('link')).toHaveTextContent(
        'https://custom.example.org/#/!room:example.com'
      )
    );
  });

  it('builds cache-busted retry URLs after the first attempt', () => {
    expect(buildConfigAttemptUrl('/config.json', 0)).toBe('/config.json');
    expect(buildConfigAttemptUrl('/config.json', 1)).toMatch(/^\/config\.json\?cacheBust=/);
    expect(buildConfigAttemptUrl('/config.json?foo=bar', 2)).toMatch(
      /^\/config\.json\?foo=bar&cacheBust=/
    );
  });

  it('retries config fetches with cache-busting and no-store semantics', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Unavailable',
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Unavailable',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({ matrixToBaseUrl: 'https://custom.example.org' }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const configPromise = getClientConfig();
    await vi.runAllTimersAsync();
    await expect(configPromise).resolves.toMatchObject({
      matrixToBaseUrl: 'https://custom.example.org',
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/config.json',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          'cache-control': 'no-cache',
          pragma: 'no-cache',
        }),
      })
    );
    expect(fetchMock.mock.calls[1]?.[0]).toMatch(/^\/config\.json\?cacheBust=/);
    expect(fetchMock.mock.calls[2]?.[0]).toMatch(/^\/config\.json\?cacheBust=/);
    vi.useRealTimers();
  });
});
