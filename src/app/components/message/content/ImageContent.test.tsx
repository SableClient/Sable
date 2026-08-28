import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageContent } from './ImageContent';
import { downloadEncryptedMedia, mxcUrlToHttp } from '$utils/matrix';
import type * as PlatformModule from '$utils/platform';

const screenMocks = vi.hoisted(() => ({
  isMobile: true,
  tauri: false,
  loopbackUrl: undefined as string | undefined,
  stripsCache: true,
}));

vi.mock('$utils/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof PlatformModule>()),
  webviewStripsCustomProtocolCache: () => screenMocks.stripsCache,
}));
vi.mock('$hooks/useScreenSize', () => ({
  ScreenSize: { Desktop: 'Desktop', Tablet: 'Tablet', Mobile: 'Mobile' },
  useScreenSizeOptionally: () => (screenMocks.isMobile ? 'Mobile' : 'Desktop'),
  useCompactLayout: () => screenMocks.isMobile,
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => screenMocks.tauri,
  invoke: async () => {
    if (!screenMocks.loopbackUrl) throw new Error('loopback media server unavailable');
    return screenMocks.loopbackUrl;
  },
  // Real convertFileSrc percent-encodes the target into the URI path.
  convertFileSrc: (url: string, protocol: string) =>
    `${protocol}://localhost/${encodeURIComponent(url)}`,
}));

const SABLE_MEDIA_URL =
  'sable-media://https://hs.example/_matrix/client/v1/media/download/example.org/abc123?__sable_media_cache=3';
vi.mock('$utils/matrix', () => ({
  mxcUrlToHttp: vi.fn<(...args: unknown[]) => string>(() => SABLE_MEDIA_URL),
  rewriteAuthenticatedMediaUrl: (url: string | null) => url,
  downloadEncryptedMedia: vi.fn<() => Promise<ArrayBuffer>>(),
  decryptFile: vi.fn<() => Promise<ArrayBuffer>>(),
}));

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({}),
}));
vi.mock('$hooks/useMediaAuthentication', () => ({
  useMediaAuthentication: () => false,
}));
vi.mock('$hooks/useFavoriteGifs', () => ({
  useFavoriteGifs: () => ({ gifs: [] }),
}));
vi.mock('$hooks/useRenderableMediaUrl', () => ({
  useRenderableMediaUrl: (url: string | undefined) => url,
}));
vi.mock('$hooks/useObjectURL', () => ({
  useCreateObjectURL: () => (value: string) => value,
}));

const imageContent = (
  <ImageContent
    url="https://example.com/image.png"
    renderImage={() => <img alt="preview" />}
    renderViewer={() => <button type="button">viewer</button>}
  />
);

const touchTap = (target: Element) => {
  fireEvent.pointerDown(target, {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    clientX: 10,
    clientY: 10,
  });
  fireEvent.pointerUp(target, {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    clientX: 10,
    clientY: 10,
  });
  fireEvent.click(target);
};

// Mirrors Message.tsx: an enclosing long-press timer that media gestures must
// not trigger (media containers are marked `data-gestures="ignore"`).
const renderWithLongPress = (children: ReactNode, onLongPress: () => void) =>
  render(
    <div
      onTouchStart={(evt) => {
        const target = evt.target as Element;
        if (target.closest('[data-gestures="ignore"]')) return;
        setTimeout(onLongPress, 500);
      }}
    >
      {children}
    </div>
  );

describe('ImageContent', () => {
  it('opens the viewer after one tap on idle media', async () => {
    render(imageContent);

    touchTap(screen.getByRole('button', { name: 'View' }));

    await waitFor(() => expect(screen.getByText('viewer')).toBeInTheDocument());
    expect(screen.getByAltText('preview').closest('[data-gestures="ignore"]')).not.toBeNull();
  });

  it('falls back to its own viewer when the room gallery declines to open', async () => {
    const onOpenViewer = vi.fn<() => boolean>(() => false);
    render(
      <ImageContent
        url="https://example.com/image.png"
        renderImage={() => <img alt="preview" />}
        renderViewer={() => <button type="button">viewer</button>}
        onOpenViewer={onOpenViewer}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'View' }));

    await waitFor(() => expect(screen.getByText('viewer')).toBeInTheDocument());
    expect(onOpenViewer).toHaveBeenCalled();
  });

  it('leaves the local viewer closed when the room gallery takes over', async () => {
    const onOpenViewer = vi.fn<() => boolean>(() => true);
    render(
      <ImageContent
        url="https://example.com/image.png"
        renderImage={() => <img alt="preview" />}
        renderViewer={() => <button type="button">viewer</button>}
        onOpenViewer={onOpenViewer}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'View' }));

    await waitFor(() => expect(onOpenViewer).toHaveBeenCalled());
    expect(screen.queryByText('viewer')).not.toBeInTheDocument();
  });

  it('does not mount hover controls for touch pointer entry', () => {
    render(imageContent);

    const media = screen.getByRole('button', { name: 'View' }).closest('[data-gestures="ignore"]');
    expect(media).not.toBeNull();
    fireEvent.pointerEnter(media!, { pointerType: 'touch' });
    expect(screen.queryByTitle('Hide Image')).not.toBeInTheDocument();

    fireEvent.pointerEnter(media!, { pointerType: 'mouse' });
    expect(screen.getByTitle('Hide Image')).toBeInTheDocument();
  });

  it('keeps media touches out of an enclosing message long-press timer', () => {
    vi.useFakeTimers();
    const messageLongPress = vi.fn<() => void>();
    try {
      renderWithLongPress(imageContent, messageLongPress);

      const view = screen.getByRole('button', { name: 'View' });
      fireEvent.touchStart(view, {
        touches: [{ identifier: 1, clientX: 10, clientY: 10 }],
      });
      touchTap(view);
      vi.advanceTimersByTime(600);

      expect(messageLongPress).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders a distinct sable-media src on retry in Tauri', async () => {
    screenMocks.tauri = true;
    try {
      const srcs: string[] = [];
      render(
        <ImageContent
          url="mxc://example.org/abc123"
          renderImage={(props) => {
            srcs.push(props.src);
            return <img alt="preview" src={props.src} onError={props.onError} />;
          }}
          renderViewer={() => <div>viewer</div>}
        />
      );

      touchTap(screen.getByRole('button', { name: 'View' }));

      const img = await screen.findByAltText('preview');
      const initialSrc = srcs[srcs.length - 1];
      expect(initialSrc).toBe(SABLE_MEDIA_URL);

      fireEvent.keyDown(document.body, { key: 'Escape' });
      fireEvent.error(img);
      const retry = await screen.findByRole('button', { name: 'Retry' });
      fireEvent.pointerDown(retry, { pointerId: 2, pointerType: 'mouse', isPrimary: true });
      fireEvent.click(retry);

      await waitFor(() => {
        const retriedSrc = srcs[srcs.length - 1] ?? '';
        expect(retriedSrc).not.toBe(initialSrc);
        // The decoded scheme path is the `target` Rust feeds into cache_key.
        const schemePath = retriedSrc.replace(/^sable-media:\/\/localhost\//, '').split('?')[0]!;
        expect(decodeURIComponent(schemePath)).toMatch(
          /^https:\/\/hs\.example\/_matrix\/client\/v1\/media\/download\/example\.org\/abc123#__sable_media_retry=\d+$/
        );
        expect(retriedSrc).toContain('__sable_media_cache=3');
      });
    } finally {
      screenMocks.tauri = false;
    }
  });

  it('loads a Tauri image once, from the loopback origin', async () => {
    screenMocks.tauri = true;
    screenMocks.loopbackUrl = 'http://127.0.0.1:45678/capability';
    try {
      const srcs: string[] = [];
      render(
        <ImageContent
          url="mxc://example.org/abc123"
          renderImage={(props) => {
            srcs.push(props.src);
            return <img alt="preview" src={props.src} onError={props.onError} />;
          }}
          renderViewer={() => <div>viewer</div>}
        />
      );

      touchTap(screen.getByRole('button', { name: 'View' }));
      await screen.findByAltText('preview');

      await waitFor(() => expect(srcs.length).toBeGreaterThan(0));
      expect(Array.from(new Set(srcs))).toEqual(['http://127.0.0.1:45678/capability']);
    } finally {
      screenMocks.tauri = false;
      screenMocks.loopbackUrl = undefined;
    }
  });

  it('loads a Tauri image from the custom protocol where its cache headers survive', async () => {
    screenMocks.tauri = true;
    screenMocks.stripsCache = false;
    screenMocks.loopbackUrl = 'http://127.0.0.1:45678/capability';
    try {
      const srcs: string[] = [];
      render(
        <ImageContent
          url="mxc://example.org/abc123"
          renderImage={(props) => {
            srcs.push(props.src);
            return <img alt="preview" src={props.src} onError={props.onError} />;
          }}
          renderViewer={() => <div>viewer</div>}
        />
      );

      touchTap(screen.getByRole('button', { name: 'View' }));
      await screen.findByAltText('preview');

      await waitFor(() => expect(srcs.length).toBeGreaterThan(0));
      expect(Array.from(new Set(srcs))).toEqual([SABLE_MEDIA_URL]);
    } finally {
      screenMocks.tauri = false;
      screenMocks.stripsCache = true;
      screenMocks.loopbackUrl = undefined;
    }
  });

  it('passes the Tauri media URL straight to the encrypted download', async () => {
    screenMocks.tauri = true;
    const renderViewer = vi.fn<(props: { getDownloadBlob?: () => Promise<Blob> }) => ReactNode>(
      () => <div>viewer</div>
    );
    vi.mocked(downloadEncryptedMedia).mockResolvedValue(new Blob(['encrypted']));
    try {
      render(
        <ImageContent
          url="mxc://example.org/abc123"
          encInfo={{ key: {}, iv: 'iv', hashes: {} } as never}
          renderImage={() => <img alt="preview" />}
          renderViewer={renderViewer}
        />
      );

      touchTap(screen.getByRole('button', { name: 'View' }));
      await waitFor(() => expect(renderViewer).toHaveBeenCalledOnce());
      await renderViewer.mock.calls[0]?.[0].getDownloadBlob?.();

      expect(downloadEncryptedMedia).toHaveBeenCalledWith(
        'sable-media://https://hs.example/_matrix/client/v1/media/download/example.org/abc123?__sable_media_cache=3',
        expect.any(Function)
      );
    } finally {
      screenMocks.tauri = false;
    }
  });

  it('falls back to the original when the homeserver thumbnail is transposed', async () => {
    vi.mocked(mxcUrlToHttp).mockClear();
    render(
      <ImageContent
        url="mxc://example.org/abc123"
        info={{ w: 1500, h: 2000, size: 4 * 1024 * 1024, mimetype: 'image/jpeg' }}
        renderImage={(props) => <img alt="preview" src={props.src} onLoad={props.onLoad} />}
        renderViewer={() => <div>viewer</div>}
      />
    );

    touchTap(screen.getByRole('button', { name: 'View' }));
    const img = await screen.findByAltText('preview');
    expect(vi.mocked(mxcUrlToHttp)).toHaveBeenCalledWith(
      {},
      'mxc://example.org/abc123',
      false,
      800,
      600,
      'scale'
    );
    Object.defineProperty(img, 'naturalWidth', { value: 800, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 600, configurable: true });
    fireEvent.load(img);

    await waitFor(() =>
      expect(vi.mocked(mxcUrlToHttp).mock.calls.at(-1)).toEqual([
        {},
        'mxc://example.org/abc123',
        false,
      ])
    );
  });

  it('still allows ordinary message touches to start long press', () => {
    vi.useFakeTimers();
    const messageLongPress = vi.fn<() => void>();
    try {
      renderWithLongPress(<span>ordinary message</span>, messageLongPress);

      fireEvent.touchStart(screen.getByText('ordinary message'), {
        touches: [{ identifier: 1, clientX: 10, clientY: 10 }],
      });
      vi.advanceTimersByTime(600);

      expect(messageLongPress).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
