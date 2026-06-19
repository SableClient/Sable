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

const settings = {
  linkPreviewImageMaxHeight: 240,
  autoplayGifs: false,
};

vi.mock('$state/hooks/settings', () => ({
  useSetting: (_atom: unknown, key: keyof typeof settings) => [settings[key]],
}));

let mockedMimeType = 'image/png';

vi.mock('$hooks/useMediaMetadata', () => ({
  useMediaMetadata: (cacheKey?: string) => ({
    width: 720,
    height: 1280,
    mimeType:
      typeof cacheKey === 'string' && cacheKey.toLowerCase().includes('.gif')
        ? 'image/gif'
        : mockedMimeType,
  }),
}));

vi.mock('$components/message', () => ({
  AudioContent: ({ url }: { url: string }) => <div data-testid="audio-content">{url}</div>,
  ImageContent: () => null,
  VideoContent: () => null,
}));

vi.mock('$components/media', () => ({
  Image: ({ src, onError }: { src: string; onError?: () => void }) => (
    <div>
      <div data-testid="direct-image">{src}</div>
      {onError && (
        <button type="button" data-testid="image-error" onClick={onError}>
          fail
        </button>
      )}
    </div>
  ),
  MediaControl: () => null,
  Video: ({ src, onError }: { src?: string; onError?: () => void }) => (
    <div>
      <div data-testid="direct-video">{src}</div>
      {onError && (
        <button type="button" data-testid="video-error" onClick={onError}>
          fail
        </button>
      )}
    </div>
  ),
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
  it('recomputes animated direct-image fallback when gif autoplay is toggled', () => {
    settings.autoplayGifs = true;
    const { rerender } = renderWithProviders(
      <UrlPreviewCard urlPreview url="https://example.com/images/test.gif" mediaType="image" />
    );

    expect(screen.getByTestId('direct-image')).toHaveTextContent(
      'https://example.com/images/test.gif'
    );

    settings.autoplayGifs = false;
    rerender(
      <JotaiProvider>
        <MatrixClientProvider value={{ getAccessToken: () => null } as never}>
          <UrlPreviewCard urlPreview url="https://example.com/images/test.gif" mediaType="image" />
        </MatrixClientProvider>
      </JotaiProvider>
    );

    expect(screen.queryByTestId('direct-image')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'https://example.com/images/test.gif' })
    ).toBeInTheDocument();
  });

  it('keeps rendering extensionless direct images when animated mime metadata arrives later', () => {
    settings.autoplayGifs = false;
    mockedMimeType = 'image/png';
    const { rerender } = renderWithProviders(
      <UrlPreviewCard urlPreview url="https://example.com/media/asset" mediaType="image" />
    );

    expect(screen.getByTestId('direct-image')).toHaveTextContent('https://example.com/media/asset');

    mockedMimeType = 'image/gif';
    rerender(
      <JotaiProvider>
        <MatrixClientProvider value={{ getAccessToken: () => null } as never}>
          <UrlPreviewCard urlPreview url="https://example.com/media/asset" mediaType="image" />
        </MatrixClientProvider>
      </JotaiProvider>
    );

    expect(screen.getByTestId('direct-image')).toHaveTextContent('https://example.com/media/asset');
  });

  it('renders direct image urls through the shared media preview card', () => {
    settings.autoplayGifs = false;
    renderWithProviders(
      <UrlPreviewCard urlPreview url="https://example.com/images/test.png" mediaType="image" />
    );

    expect(screen.getByTestId('url-preview')).toBeInTheDocument();
    expect(screen.getByTestId('direct-image')).toHaveTextContent(
      'https://example.com/images/test.png'
    );
    expect(
      screen.getByRole('link', { name: 'https://example.com/images/test.png' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, el) => el?.getAttribute('style')?.includes('aspect-ratio: 720 / 1280') ?? false
      )
    ).toBeInTheDocument();
  });

  it('falls back to a plain link card for direct animated image links when gif autoplay is disabled', () => {
    settings.autoplayGifs = false;
    renderWithProviders(
      <UrlPreviewCard urlPreview url="https://example.com/images/test.gif" mediaType="image" />
    );

    expect(screen.queryByTestId('direct-image')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'https://example.com/images/test.gif' })
    ).toBeInTheDocument();
  });

  it('still renders direct static webp images when gif autoplay is disabled', () => {
    settings.autoplayGifs = false;
    mockedMimeType = 'image/webp';

    renderWithProviders(
      <UrlPreviewCard urlPreview url="https://example.com/images/test.webp" mediaType="image" />
    );

    expect(screen.getByTestId('direct-image')).toHaveTextContent(
      'https://example.com/images/test.webp'
    );
    expect(
      screen.getByRole('link', { name: 'https://example.com/images/test.webp' })
    ).toBeInTheDocument();
  });

  it('falls back to a plain link card when a direct image preview errors', () => {
    settings.autoplayGifs = false;
    renderWithProviders(
      <UrlPreviewCard urlPreview url="https://example.com/images/test.png" mediaType="image" />
    );

    fireEvent.click(screen.getByTestId('image-error'));

    expect(screen.queryByTestId('direct-image')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'https://example.com/images/test.png' })
    ).toBeInTheDocument();
  });

  it('falls back to a plain link card when a direct video preview errors', () => {
    settings.autoplayGifs = false;
    renderWithProviders(
      <UrlPreviewCard urlPreview url="https://example.com/videos/test.mp4" mediaType="video" />
    );

    fireEvent.click(screen.getByTestId('video-error'));

    expect(screen.queryByTestId('direct-video')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'https://example.com/videos/test.mp4' })
    ).toBeInTheDocument();
  });

  it('normalizes uppercase direct media schemes before rendering', () => {
    settings.autoplayGifs = false;
    renderWithProviders(
      <UrlPreviewCard urlPreview url="HTTPS://example.com/images/test.PNG" mediaType="image" />
    );

    expect(screen.getByTestId('direct-image')).toHaveTextContent(
      'https://example.com/images/test.PNG'
    );
  });

  it('falls back to a plain link card when direct media auto-load is disabled', () => {
    settings.autoplayGifs = false;
    renderWithProviders(
      <UrlPreviewCard
        urlPreview
        url="https://example.com/images/test.png"
        mediaType="image"
        mediaAutoLoad={false}
      />
    );

    expect(screen.queryByTestId('direct-image')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'https://example.com/images/test.png' })
    ).toBeInTheDocument();
  });
});
