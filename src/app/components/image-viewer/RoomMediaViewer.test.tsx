import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import * as css from './ImageViewer.css';
import { RoomMediaViewer, type RoomMediaItem } from './RoomMediaViewer';

vi.mock('$hooks/useScreenSize', () => ({
  ScreenSize: { Desktop: 'Desktop', Tablet: 'Tablet', Mobile: 'Mobile' },
  useScreenSizeContext: () => 'Mobile',
  useScreenSizeOptionally: () => 'Mobile',
  useCompactLayout: () => true,
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
  invoke: vi.fn<() => Promise<void>>(),
}));

const downloadEncryptedMedia = vi.fn<() => Promise<ArrayBuffer>>();
vi.mock('$utils/matrix', () => ({
  mxcUrlToHttp: (_mx: unknown, url: string) => `https://hs.example/${url}`,
  rewriteAuthenticatedMediaUrl: (url: string | null) => url,
  downloadEncryptedMedia: (...args: []) => downloadEncryptedMedia(...args),
  decryptFile: vi.fn<() => Promise<ArrayBuffer>>(),
  downloadMedia: vi.fn<() => Promise<Blob>>(),
}));

vi.mock('$hooks/useMatrixClient', () => ({ useMatrixClient: () => ({}) }));
vi.mock('$hooks/useMediaAuthentication', () => ({ useMediaAuthentication: () => false }));
vi.mock('$hooks/useRenderableMediaUrl', () => ({
  useRenderableMediaUrl: (url: string | undefined) => url,
}));
const createObjectURL = vi.fn<(object: Blob | Promise<Blob>) => Promise<string>>(async (value) => {
  await value;
  return 'blob:resolved';
});
vi.mock('$hooks/useObjectURL', () => ({ useCreateObjectURL: () => createObjectURL }));

const items: RoomMediaItem[] = [
  { eventId: '$one', body: 'first.png', url: 'mxc://example.org/one' },
  { eventId: '$two', body: 'second.png', url: 'mxc://example.org/two' },
];

const renderViewer = (selectedEventId: string, selectEvent = vi.fn<(id: string) => void>()) => {
  render(
    <RoomMediaViewer
      items={items}
      selectedEventId={selectedEventId}
      requestClose={vi.fn<() => void>()}
      selectEvent={selectEvent}
    />
  );
  return selectEvent;
};

describe('RoomMediaViewer', () => {
  it('renders the viewer for the selected item', async () => {
    renderViewer('$one');

    expect(await screen.findByAltText('first.png')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('offers both directions on the first item', async () => {
    renderViewer('$one');

    await screen.findByAltText('first.png');
    expect(screen.getByRole('button', { name: 'Next image' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous image' })).toBeInTheDocument();
  });

  it('dims the wrap-around buttons on the bundle edges', async () => {
    const { rerender } = render(
      <RoomMediaViewer
        items={items}
        selectedEventId="$one"
        requestClose={vi.fn<() => void>()}
        selectEvent={vi.fn<(id: string) => void>()}
      />
    );
    await screen.findByAltText('first.png');

    expect(screen.getByRole('button', { name: 'Previous image' }).className).toContain(
      css.ImageViewerEdge
    );
    expect(screen.getByRole('button', { name: 'Next image' }).className).not.toContain(
      css.ImageViewerEdge
    );

    rerender(
      <RoomMediaViewer
        items={items}
        selectedEventId="$two"
        requestClose={vi.fn<() => void>()}
        selectEvent={vi.fn<(id: string) => void>()}
      />
    );
    await screen.findByAltText('second.png');

    expect(screen.getByRole('button', { name: 'Next image' }).className).toContain(
      css.ImageViewerEdge
    );
    expect(screen.getByRole('button', { name: 'Previous image' }).className).not.toContain(
      css.ImageViewerEdge
    );
  });

  it('selects the following event when Next is tapped', async () => {
    const selectEvent = renderViewer('$one');

    await screen.findByAltText('first.png');
    fireEvent.click(screen.getByRole('button', { name: 'Next image' }));

    await waitFor(() => expect(selectEvent).toHaveBeenCalledWith('$two'));
  });

  it('navigates between items with the arrow keys', async () => {
    const selectEvent = renderViewer('$one');

    await screen.findByAltText('first.png');
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    await waitFor(() => expect(selectEvent).toHaveBeenCalledWith('$two'));
  });

  it('moves to the previous item with ArrowLeft', async () => {
    const selectEvent = renderViewer('$two');

    await screen.findByAltText('second.png');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });

    await waitFor(() => expect(selectEvent).toHaveBeenCalledWith('$one'));
  });

  it('wraps to the first item with ArrowRight on the last', async () => {
    const selectEvent = renderViewer('$two');

    await screen.findByAltText('second.png');
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    await waitFor(() => expect(selectEvent).toHaveBeenCalledWith('$one'));
  });

  it('wraps to the last item when pressing Previous on the first', async () => {
    const selectEvent = renderViewer('$one');

    await screen.findByAltText('first.png');
    fireEvent.click(screen.getByRole('button', { name: 'Previous image' }));

    await waitFor(() => expect(selectEvent).toHaveBeenCalledWith('$two'));
  });

  it('does not navigate while a button is focused', async () => {
    const selectEvent = renderViewer('$one');

    await screen.findByAltText('first.png');
    const nextButton = screen.getByRole('button', { name: 'Next image' });
    fireEvent.keyDown(nextButton, { key: 'ArrowRight' });

    expect(selectEvent).not.toHaveBeenCalled();
  });

  it('closes when the selected event is no longer in the gallery', async () => {
    const requestClose = vi.fn<() => void>();
    render(
      <RoomMediaViewer
        items={items}
        selectedEventId="$redacted"
        requestClose={requestClose}
        selectEvent={vi.fn<(id: string) => void>()}
      />
    );

    await waitFor(() => expect(requestClose).toHaveBeenCalled());
  });

  it('shows retry when encrypted media resolution fails', async () => {
    downloadEncryptedMedia.mockRejectedValueOnce(new Error('download failed'));
    const encInfo = { key: {}, iv: 'iv', hashes: {} } as EncryptedAttachmentInfo;
    const encryptedItems: RoomMediaItem[] = [
      {
        eventId: '$enc',
        body: 'secret.png',
        url: 'mxc://example.org/enc',
        encInfo,
        mimeType: 'image/png',
      },
    ];

    render(
      <RoomMediaViewer
        items={encryptedItems}
        selectedEventId="$enc"
        requestClose={vi.fn<() => void>()}
        selectEvent={vi.fn<(id: string) => void>()}
      />
    );

    expect(await screen.findByText('Failed to load media')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('keeps the previous image mounted while the next resolves', async () => {
    const encInfo = { key: {}, iv: 'iv', hashes: {} } as EncryptedAttachmentInfo;
    const encryptedItems: RoomMediaItem[] = [
      {
        eventId: '$one',
        body: 'first.png',
        url: 'mxc://example.org/one',
        encInfo,
        mimeType: 'image/png',
      },
      {
        eventId: '$two',
        body: 'second.png',
        url: 'mxc://example.org/two',
        encInfo,
        mimeType: 'image/png',
      },
    ];
    let releaseSecond: ((buffer: ArrayBuffer) => void) | undefined;
    downloadEncryptedMedia.mockResolvedValueOnce(new ArrayBuffer(1)).mockImplementationOnce(
      () =>
        new Promise<ArrayBuffer>((resolve) => {
          releaseSecond = resolve;
        })
    );

    const viewer = render(
      <RoomMediaViewer
        items={encryptedItems}
        selectedEventId="$one"
        requestClose={vi.fn<() => void>()}
        selectEvent={vi.fn<(id: string) => void>()}
      />
    );
    await screen.findByAltText('first.png');

    viewer.rerender(
      <RoomMediaViewer
        items={encryptedItems}
        selectedEventId="$two"
        requestClose={vi.fn<() => void>()}
        selectEvent={vi.fn<(id: string) => void>()}
      />
    );
    expect(screen.getByAltText('first.png')).toBeInTheDocument();
    expect(screen.queryByAltText('second.png')).not.toBeInTheDocument();

    releaseSecond?.(new ArrayBuffer(1));
    expect(await screen.findByAltText('second.png')).toBeInTheDocument();
  });

  it('does not double-download encrypted media when preloading on web', async () => {
    downloadEncryptedMedia.mockClear();
    const encInfo = { key: {}, iv: 'iv', hashes: {} } as EncryptedAttachmentInfo;
    const encryptedItems: RoomMediaItem[] = [
      {
        eventId: '$one',
        body: 'a.png',
        url: 'mxc://example.org/a',
        encInfo,
        mimeType: 'image/png',
      },
      {
        eventId: '$two',
        body: 'b.png',
        url: 'mxc://example.org/b',
        encInfo,
        mimeType: 'image/png',
      },
      {
        eventId: '$three',
        body: 'c.png',
        url: 'mxc://example.org/c',
        encInfo,
        mimeType: 'image/png',
      },
    ];

    render(
      <RoomMediaViewer
        items={encryptedItems}
        selectedEventId="$two"
        requestClose={vi.fn<() => void>()}
        selectEvent={vi.fn<(id: string) => void>()}
      />
    );
    await screen.findByAltText('b.png');
    await waitFor(() => expect(downloadEncryptedMedia).toHaveBeenCalledTimes(1));
  });
});
