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
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { setMatrixToBase, getMatrixToRoom, getMatrixToUser } from '$plugins/matrix-to';
import { ClientConfigLoader } from './ClientConfigLoader';

afterEach(() => {
  setMatrixToBase(); // reset module state to 'https://matrix.to'
  vi.unstubAllGlobals();
});

const mockFetch = (config: object) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve(config) }));

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
});
