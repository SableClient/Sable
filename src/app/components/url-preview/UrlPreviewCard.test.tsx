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
  useSetting: (_atom: unknown, key: string) => {
    if (key === 'linkPreviewImageMaxHeight') return [240];
    if (key === 'autoplayGifs') return [false];
    return [undefined];
  },
}));

vi.mock('$hooks/useMediaMetadata', () => ({
  useMediaMetadata: () => ({
    width: 1280,
    height: 720,
    mimeType: 'image/gif',
  }),
}));

vi.mock('$components/message', () => ({
  AudioContent: ({ url }: { url: string }) => <div data-testid="audio-content">{url}</div>,
  ImageContent: ({
    url,
    onError,
    renderImage,
  }: {
    url: string;
    onError?: () => void;
    renderImage?: (props: { src: string }) => ReactNode;
  }) => (
    <div>
      <div data-testid="image-content">{url}</div>
      {renderImage?.({ src: url })}
      {onError && (
        <button type="button" data-testid="image-error" onClick={onError}>
          fail
        </button>
      )}
    </div>
  ),
  VideoContent: ({ url, onError }: { url: string; onError?: () => void }) => (
    <div>
      <div data-testid="video-content">{url}</div>
      {onError && (
        <button type="button" data-testid="video-error" onClick={onError}>
          fail
        </button>
      )}
    </div>
  ),
}));

vi.mock('$components/media', () => ({
  Image: () => null,
  MediaControl: () => null,
  Video: () => null,
}));

vi.mock('$components/image-viewer', () => ({
  ImageViewer: () => null,
}));

vi.mock('$components/ClientSideHoverFreeze', () => ({
  ClientSideHoverFreeze: ({ children }: { children: ReactNode }) => (
    <div data-testid="hover-freeze">{children}</div>
  ),
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

  it('wraps direct animated image links in hover freeze when gif autoplay is disabled', () => {
    renderWithProviders(
      <UrlPreviewCard urlPreview url="https://example.com/images/test.gif" mediaType="image" />
    );

    expect(screen.getByTestId('hover-freeze')).toBeInTheDocument();
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

  it('falls back to a plain link card when a direct video preview errors', () => {
    renderWithProviders(
      <UrlPreviewCard urlPreview url="https://example.com/videos/test.mp4" mediaType="video" />
    );

    fireEvent.click(screen.getByTestId('video-error'));

    expect(screen.queryByTestId('video-content')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'https://example.com/videos/test.mp4' })
    ).toBeInTheDocument();
  });
});
