import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
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

  it('offers next but not previous on the first item', async () => {
    renderViewer('$one');

    await screen.findByAltText('first.png');
    expect(screen.getByRole('button', { name: 'Next image' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Previous image' })).not.toBeInTheDocument();
  });

  it('selects the following event when Next is tapped', async () => {
    const selectEvent = renderViewer('$one');

    await screen.findByAltText('first.png');
    fireEvent.click(screen.getByRole('button', { name: 'Next image' }));

    await waitFor(() => expect(selectEvent).toHaveBeenCalledWith('$two'));
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
});
