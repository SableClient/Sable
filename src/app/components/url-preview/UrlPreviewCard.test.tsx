import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { MatrixClientProvider } from '$hooks/useMatrixClient';
import { UrlPreviewCard } from './UrlPreviewCard';

vi.mock('$hooks/useMediaAuthentication', () => ({
  useMediaAuthentication: () => false,
}));

vi.mock('$hooks/useAsyncCallback', () => ({
  AsyncStatus: {
    Idle: 'idle',
    Loading: 'loading',
    Success: 'success',
    Error: 'error',
  },
  useAsyncCallback: () => [
    { status: 'success', data: null },
    vi.fn<() => Promise<null>>().mockResolvedValue(null),
  ],
}));

vi.mock('$state/hooks/settings', () => ({
  useSetting: () => [240],
}));

vi.mock('$hooks/useMediaMetadata', () => ({
  useMediaMetadata: () => ({
    width: 1280,
    height: 720,
    mimeType: 'image/png',
  }),
}));

vi.mock('$components/message', () => ({
  AudioContent: ({ url }: { url: string }) => <div data-testid="audio-content">{url}</div>,
  ImageContent: ({ url, onError }: { url: string; onError?: () => void }) => (
    <div>
      <div data-testid="image-content">{url}</div>
      {onError && (
        <button type="button" data-testid="image-error" onClick={onError}>
          fail
        </button>
      )}
    </div>
  ),
  VideoContent: ({ url }: { url: string }) => <div data-testid="video-content">{url}</div>,
}));

vi.mock('$components/media', () => ({
  Image: () => null,
  MediaControl: () => null,
  Video: () => null,
}));

vi.mock('$components/image-viewer', () => ({
  ImageViewer: () => null,
}));

vi.mock('./UrlPreview', () => ({
  UrlPreview: ({ children }: { children: ReactNode }) => (
    <div data-testid="url-preview">{children}</div>
  ),
  UrlPreviewContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="url-preview-content">{children}</div>
  ),
  UrlPreviewDescription: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const renderWithProviders = (ui: ReactNode) =>
  render(
    <JotaiProvider>
      <MatrixClientProvider value={{ getAccessToken: () => null } as never}>
        {ui}
      </MatrixClientProvider>
    </JotaiProvider>
  );

describe('UrlPreviewCard', () => {
  it('renders direct image urls through the shared media preview card', () => {
    renderWithProviders(
      <UrlPreviewCard urlPreview url="https://example.com/images/test.png" mediaType="image" />
    );

    expect(screen.getByTestId('url-preview')).toBeInTheDocument();
    expect(screen.getByTestId('image-content')).toHaveTextContent(
      'https://example.com/images/test.png'
    );
    expect(
      screen.getByRole('link', { name: 'https://example.com/images/test.png' })
    ).toBeInTheDocument();
  });

  it('falls back to a plain link card when a direct image preview errors', () => {
    renderWithProviders(
      <UrlPreviewCard urlPreview url="https://example.com/images/test.png" mediaType="image" />
    );

    fireEvent.click(screen.getByTestId('image-error'));

    expect(screen.queryByTestId('image-content')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'https://example.com/images/test.png' })
    ).toBeInTheDocument();
  });
});
