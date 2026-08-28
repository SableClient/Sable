import type { SyntheticEvent, WheelEvent } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FileSaver from 'file-saver';
import { ImageViewer } from './ImageViewer';
import { showToast } from '$state/toast';
import type { IImageInfo } from '$types/matrix/common';

const downloadMedia = vi.fn<(src: string) => Promise<Blob>>();
const saveMediaToGallery =
  vi.fn<(input: Blob | string, filename: string, mimeType: string) => Promise<void>>();
const toastMocks = vi.hoisted(() => ({
  showToast: vi.fn<(text: string, durationMs?: number) => void>(),
}));
vi.mock('$state/toast', () => ({ showToast: toastMocks.showToast }));
const platformMocks = vi.hoisted(() => ({
  isAndroidTauri: vi.fn<() => boolean>(() => false),
  iosApp: vi.fn<() => boolean>(() => false),
}));
const screenMocks = vi.hoisted(() => ({ isMobile: false }));
vi.mock('$utils/platform', async (importOriginal) => ({
  ...(await importOriginal()),
  isAndroidTauri: platformMocks.isAndroidTauri,
  iosApp: platformMocks.iosApp,
}));
const gestureMocks = vi.hoisted(() => ({
  onPointerDown: vi.fn<(event: React.PointerEvent) => void>(),
}));

vi.mock('$hooks/useImageGestures', () => ({
  useImageGestures: () => ({
    transforms: { zoom: 1, pan: { x: 0, y: 0 } },
    cursor: 'grab',
    fitRatio: 1,
    imageRef: { current: null },
    containerRef: { current: null },
    handleWheel: vi.fn<(event: WheelEvent) => void>(),
    onPointerDown: gestureMocks.onPointerDown,
    handleImageLoad: vi.fn<(event: SyntheticEvent<HTMLImageElement>) => void>(),
    setZoom: vi.fn<(next: number) => void>(),
    resetTransforms: vi.fn<() => void>(),
    zoomIn: vi.fn<() => void>(),
    zoomOut: vi.fn<() => void>(),
    enableResizeWithWindow: vi.fn<() => void>(),
  }),
}));

vi.mock('$utils/matrix', () => ({
  downloadMedia: (...args: [string]) => downloadMedia(...args),
}));
vi.mock('$utils/download', async (importOriginal) => ({
  ...(await importOriginal()),
  saveMediaToGallery: (...args: [Blob | string, string, string]) => saveMediaToGallery(...args),
}));

vi.mock('file-saver', () => ({
  default: {
    saveAs: vi.fn<(data: Blob | string, filename?: string) => void>(),
  },
}));

vi.mock('$hooks/useScreenSize', () => ({
  ScreenSize: { Desktop: 'Desktop', Tablet: 'Tablet', Mobile: 'Mobile' },
  useScreenSizeContext: () => (screenMocks.isMobile ? 'Mobile' : 'Desktop'),
  useScreenSizeOptionally: () => (screenMocks.isMobile ? 'Mobile' : 'Desktop'),
  useCompactLayout: () => screenMocks.isMobile,
}));

const renderViewer = (
  props: {
    alt?: string;
    src?: string;
    info?: IImageInfo;
    getDownloadBlob?: () => Promise<Blob>;
  } = {}
) =>
  render(
    <ImageViewer
      alt="kitten.png"
      src="https://example.org/kitten.png"
      requestClose={vi.fn<() => void>()}
      {...props}
    />
  );

const mockPlatform = (platform: 'web' | 'android' | 'ios') => {
  platformMocks.isAndroidTauri.mockReturnValue(platform === 'android');
  platformMocks.iosApp.mockReturnValue(platform === 'ios');
};

describe('ImageViewer', () => {
  it('downloads media without passing a media token argument', async () => {
    downloadMedia.mockResolvedValue(new Blob(['image']));

    renderViewer();

    fireEvent.click(screen.getByText('Download'));

    await waitFor(() => {
      expect(downloadMedia).toHaveBeenCalledWith('https://example.org/kitten.png');
    });
    expect(FileSaver.saveAs).toHaveBeenCalledWith(expect.any(Blob), 'kitten.png');
  });

  it("forwards Android's sable-media URL to the media transport unchanged", async () => {
    const source = 'https://matrix.example.org/_matrix/client/v1/media/download/example.org/kitten';
    const src = `https://sable-media.localhost/${encodeURIComponent(source)}?__sable_media_cache=3`;
    downloadMedia.mockResolvedValue(new Blob(['image']));

    renderViewer({ src });
    fireEvent.click(screen.getByText('Download'));

    await waitFor(() => {
      expect(downloadMedia).toHaveBeenCalledWith(src);
    });
  });

  it('uses the supplied decrypted blob when downloading encrypted media', async () => {
    const decryptedBlob = new Blob(['decrypted image'], { type: 'image/jpeg' });
    const getDownloadBlob = vi.fn<() => Promise<Blob>>().mockResolvedValue(decryptedBlob);
    downloadMedia.mockClear();

    renderViewer({
      src: 'sable-media://https://matrix.example.org/_matrix/client/v1/media/download/example.org/kitten',
      getDownloadBlob,
    });
    fireEvent.click(screen.getByText('Download'));

    await waitFor(() => expect(getDownloadBlob).toHaveBeenCalledOnce());
    expect(downloadMedia).not.toHaveBeenCalled();
    expect(FileSaver.saveAs).toHaveBeenCalledWith(decryptedBlob, 'kitten.png');
  });

  it('activates the download control on the first touch sequence', async () => {
    screenMocks.isMobile = true;
    downloadMedia.mockClear();
    downloadMedia.mockResolvedValue(new Blob(['image']));

    renderViewer();

    const download = screen.getByRole('button', { name: 'Download' });
    fireEvent.pointerDown(download, { pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(download, { pointerId: 1, pointerType: 'touch' });
    fireEvent.click(download);

    await waitFor(() => expect(downloadMedia).toHaveBeenCalledOnce());
    screenMocks.isMobile = false;
  });

  it('uses compact controls on mobile', () => {
    screenMocks.isMobile = true;
    try {
      renderViewer();

      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Zoom In' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'More options' }));

      expect(screen.getByText('Turn pixelation on')).toBeInTheDocument();
      expect(screen.queryByText('Zoom out')).not.toBeInTheDocument();
      expect(screen.queryByText('Zoom in')).not.toBeInTheDocument();
      expect(screen.queryByText('Save image')).not.toBeInTheDocument();
    } finally {
      screenMocks.isMobile = false;
    }
  });

  it('closes the mobile overflow menu once an item is picked', () => {
    screenMocks.isMobile = true;
    try {
      renderViewer();

      fireEvent.click(screen.getByRole('button', { name: 'More options' }));
      fireEvent.click(screen.getByText('Turn pixelation on'));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    } finally {
      screenMocks.isMobile = false;
    }
  });

  it('keeps mobile overflow menu touches out of an enclosing message long-press handler', () => {
    screenMocks.isMobile = true;
    vi.useFakeTimers();
    const messageLongPress = vi.fn<() => void>();
    try {
      render(
        <div
          onTouchStart={(evt) => {
            const target = evt.target as Element;
            if (target.closest('[data-gestures="ignore"]')) return;
            setTimeout(messageLongPress, 500);
          }}
        >
          <ImageViewer
            alt="kitten.png"
            src="https://example.org/kitten.png"
            requestClose={() => {}}
          />
        </div>
      );

      fireEvent.click(screen.getByRole('button', { name: 'More options' }));
      fireEvent.touchStart(screen.getByText('Turn pixelation on'), {
        touches: [{ identifier: 1, clientX: 10, clientY: 10 }],
      });
      vi.advanceTimersByTime(600);

      expect(messageLongPress).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      screenMocks.isMobile = false;
    }
  });

  it('hides the share control when the platform cannot share', () => {
    screenMocks.isMobile = true;
    try {
      renderViewer();

      expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
    } finally {
      screenMocks.isMobile = false;
    }
  });

  it('shows an error toast when downloading media fails', async () => {
    const error = new Error('network unavailable');
    downloadMedia.mockRejectedValue(error);
    vi.mocked(showToast).mockClear();

    renderViewer();

    fireEvent.click(screen.getByText('Download'));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Failed to download file: network unavailable');
    });
  });

  it('shows the Android gallery action for trusted image media', () => {
    mockPlatform('android');

    renderViewer({ info: { mimetype: 'image/png' } });

    fireEvent.contextMenu(screen.getByAltText('kitten.png'));

    expect(screen.getByText('Save to Gallery')).toBeInTheDocument();
  });

  it("saves media behind Android's sable-media URL to the gallery", async () => {
    mockPlatform('android');
    const source = 'https://matrix.example.org/_matrix/client/v1/media/download/example.org/kitten';
    const src = `https://sable-media.localhost/${encodeURIComponent(source)}?__sable_media_cache=3`;
    const blob = new Blob(['image'], { type: 'image/png' });
    saveMediaToGallery.mockClear();
    downloadMedia.mockClear();
    downloadMedia.mockResolvedValue(blob);

    renderViewer({ src, info: { mimetype: 'image/png' } });
    fireEvent.contextMenu(screen.getByAltText('kitten.png'));
    fireEvent.click(screen.getByText('Save to Gallery'));

    await waitFor(() =>
      expect(saveMediaToGallery).toHaveBeenCalledWith(blob, 'kitten.png', 'image/png')
    );
    expect(downloadMedia).toHaveBeenCalledWith(src);
  });

  it('labels the primary action Save to Photos on iOS without duplicating it in the overflow menu', () => {
    mockPlatform('ios');

    renderViewer({ info: { mimetype: 'image/png' } });

    fireEvent.contextMenu(screen.getByAltText('kitten.png'));

    expect(screen.getAllByText('Save to Photos')).toHaveLength(1);
  });

  it('routes the primary iOS action for trusted images straight to Photos', async () => {
    mockPlatform('ios');
    const blob = new Blob(['image'], { type: 'image/png' });
    saveMediaToGallery.mockClear();
    downloadMedia.mockClear();
    downloadMedia.mockResolvedValue(blob);
    vi.mocked(FileSaver.saveAs).mockClear();

    renderViewer({ info: { mimetype: 'image/png' } });

    fireEvent.click(screen.getByText('Save to Photos'));

    await waitFor(() =>
      expect(saveMediaToGallery).toHaveBeenCalledWith(blob, 'kitten.png', 'image/png')
    );
    expect(downloadMedia).toHaveBeenCalledWith('https://example.org/kitten.png');
    expect(FileSaver.saveAs).not.toHaveBeenCalled();
  });

  it('keeps the iOS primary action on the Files export for videos', async () => {
    mockPlatform('ios');
    saveMediaToGallery.mockClear();
    downloadMedia.mockClear();
    downloadMedia.mockResolvedValue(new Blob(['video']));

    renderViewer({
      alt: 'clip.mp4',
      src: 'https://example.org/clip.mp4',
      info: { mimetype: 'video/mp4' },
    });

    expect(screen.getByText('Download')).toBeInTheDocument();
    expect(screen.queryByText('Save to Photos')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Download'));

    await waitFor(() => expect(downloadMedia).toHaveBeenCalledWith('https://example.org/clip.mp4'));
    expect(saveMediaToGallery).not.toHaveBeenCalled();
  });
});

vi.mock('$components/media', async () => {
  const { forwardRef } = await import('react');
  return {
    Image: forwardRef<
      HTMLImageElement | HTMLCanvasElement,
      React.ImgHTMLAttributes<HTMLImageElement> & { info?: { mimetype?: string } }
    >(({ alt, info, ...props }, ref) =>
      info?.mimetype === 'application/x-tgsticker' ? (
        <canvas
          aria-label={alt}
          {...(props as React.CanvasHTMLAttributes<HTMLCanvasElement>)}
          ref={ref as React.ForwardedRef<HTMLCanvasElement>}
        />
      ) : (
        <img alt={alt} {...props} ref={ref as React.ForwardedRef<HTMLImageElement>} />
      )
    ),
  };
});

describe('ImageViewer', () => {
  it('renders the fullscreen image without crashing', () => {
    renderViewer({ alt: 'demo', src: 'https://example.com/demo.png' });

    expect(screen.getByAltText('demo')).toBeInTheDocument();
    expect(screen.getByText('Download').closest('[data-gestures="ignore"]')).not.toBeNull();
  });

  it('starts viewer gestures from the rendered lottie canvas', () => {
    gestureMocks.onPointerDown.mockClear();
    renderViewer({
      alt: 'animated sticker',
      src: 'https://example.com/sticker',
      info: { mimetype: 'application/x-tgsticker' },
    });

    const canvas = screen.getByLabelText('animated sticker');
    expect(canvas.tagName).toBe('CANVAS');
    fireEvent.pointerDown(canvas);
    expect(gestureMocks.onPointerDown).toHaveBeenCalled();
  });

  it('contains viewer touches from an enclosing message long-press handler', () => {
    const messageLongPress = vi.fn<() => void>();
    render(
      <div
        onTouchStart={(evt) => {
          const target = evt.target as Element;
          if (target.closest('[data-gestures="ignore"]')) return;
          messageLongPress();
        }}
      >
        <ImageViewer alt="demo" src="https://example.com/demo.png" requestClose={() => {}} />
      </div>
    );

    fireEvent.touchStart(screen.getByText('Download'), {
      touches: [{ identifier: 1, clientX: 10, clientY: 10 }],
    });

    expect(messageLongPress).not.toHaveBeenCalled();
  });
});
