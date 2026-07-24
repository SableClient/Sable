import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getMatrixToRoom, setMatrixToBase } from '$plugins/matrix-to';
import { ClientConfigLoader, FALLBACK_CLIENT_CONFIG } from './ClientConfigLoader';

const successfulResponse = (config: unknown) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: vi.fn<() => Promise<unknown>>().mockResolvedValue(config),
});

afterEach(() => {
  setMatrixToBase();
  vi.unstubAllGlobals();
});

describe('ClientConfigLoader', () => {
  it('does not render config-dependent children while loading', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => new Promise<Response>(() => undefined))
    );

    render(
      <ClientConfigLoader fallback={() => <span>Loading</span>}>
        {() => <span>Configured app</span>}
      </ClientConfigLoader>
    );

    expect(screen.getByText('Loading')).toBeInTheDocument();
    expect(screen.queryByText('Configured app')).not.toBeInTheDocument();
  });

  it('loads the config before rendering children', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(successfulResponse({ allowCustomHomeservers: true }))
    );

    render(
      <ClientConfigLoader>
        {(config) => <span>{String(config.allowCustomHomeservers)}</span>}
      </ClientConfigLoader>
    );

    expect(await screen.findByText('true')).toBeInTheDocument();
  });

  it('reports non-success responses and retries', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: vi.fn<() => Promise<unknown>>(),
      } as unknown as Response)
      .mockResolvedValueOnce(
        successfulResponse({ homeserverList: ['example.org'] }) as unknown as Response
      );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ClientConfigLoader
        error={(error, retry) => (
          <button type="button" onClick={retry}>
            {error instanceof Error ? error.message : 'Retry'}
          </button>
        )}
      >
        {(config) => <span>{config.homeserverList?.[0]}</span>}
      </ClientConfigLoader>
    );

    fireEvent.click(await screen.findByRole('button', { name: /503 Service Unavailable/ }));
    expect(await screen.findByText('example.org')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects non-object JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successfulResponse([])));

    render(
      <ClientConfigLoader error={(error) => <span>{String(error)}</span>}>
        {() => <span>Configured app</span>}
      </ClientConfigLoader>
    );

    expect(await screen.findByText(/must contain a JSON object/)).toBeInTheDocument();
    expect(screen.queryByText('Configured app')).not.toBeInTheDocument();
  });

  it('uses deliberate defaults only after continuing', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')));

    render(
      <ClientConfigLoader
        error={(_error, _retry, ignore) => (
          <button type="button" onClick={ignore}>
            Continue
          </button>
        )}
      >
        {(config) => <span>{config.homeserverList?.join(',')}</span>}
      </ClientConfigLoader>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(screen.getByText(FALLBACK_CLIENT_CONFIG.homeserverList?.[0] ?? '')).toBeInTheDocument();
  });

  it('applies matrix.to configuration before rendering links', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(successfulResponse({ matrixToBaseUrl: 'https://custom.example/' }))
    );

    render(
      <ClientConfigLoader>
        {(config) => {
          setMatrixToBase(config.matrixToBaseUrl);
          return <span>{getMatrixToRoom('!room:example.com')}</span>;
        }}
      </ClientConfigLoader>
    );

    await waitFor(() =>
      expect(screen.getByText('https://custom.example/#/!room:example.com')).toBeInTheDocument()
    );
  });
});
