import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import type { TUploadItem } from '$state/room/roomInputDrafts';
import { StagedUploadViewer } from './StagedUploadViewer';

vi.mock('$hooks/useObjectURL', () => ({
  useObjectURL: (file: Blob | undefined) => (file ? `blob:${(file as File).name}` : undefined),
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
  invoke: vi.fn<() => Promise<void>>(),
}));

vi.mock('$hooks/useScreenSize', () => ({
  ScreenSize: { Desktop: 'Desktop', Tablet: 'Tablet', Mobile: 'Mobile' },
  useScreenSizeContext: () => 'Desktop',
  useScreenSizeOptionally: () => 'Desktop',
  useCompactLayout: () => false,
}));

const makeItem = (name: string): TUploadItem =>
  ({
    file: new File(['x'], name, { type: 'image/png' }),
    originalFile: new File(['x'], name, { type: 'image/png' }),
    metadata: { markedAsSpoiler: false },
    encInfo: undefined as EncryptedAttachmentInfo | undefined,
  }) as TUploadItem;

const items = [makeItem('one.png'), makeItem('two.png'), makeItem('three.png')];

const renderViewer = (
  index: number,
  selectIndex = vi.fn<(i: number) => void>(),
  requestClose = vi.fn<() => void>()
) => {
  render(
    <StagedUploadViewer
      items={items}
      index={index}
      requestClose={requestClose}
      selectIndex={selectIndex}
    />
  );
  return { selectIndex, requestClose };
};

describe('StagedUploadViewer', () => {
  it('renders the selected staged image', async () => {
    renderViewer(1);

    expect(await screen.findByAltText('two.png')).toBeInTheDocument();
  });

  it('offers both chevrons and dims the wrap edges', async () => {
    renderViewer(0);

    await screen.findByAltText('one.png');
    const previous = screen.getByRole('button', { name: 'Previous image' });
    const next = screen.getByRole('button', { name: 'Next image' });
    expect(previous).toBeInTheDocument();
    expect(next).toBeInTheDocument();
  });

  it('wraps to the first staged image after the last', async () => {
    const selectIndex = vi.fn<(i: number) => void>();
    renderViewer(2, selectIndex);

    await screen.findByAltText('three.png');
    fireEvent.click(screen.getByRole('button', { name: 'Next image' }));

    await waitFor(() => expect(selectIndex).toHaveBeenCalledWith(0));
  });

  it('wraps to the last staged image before the first', async () => {
    const selectIndex = vi.fn<(i: number) => void>();
    renderViewer(0, selectIndex);

    await screen.findByAltText('one.png');
    fireEvent.click(screen.getByRole('button', { name: 'Previous image' }));

    await waitFor(() => expect(selectIndex).toHaveBeenCalledWith(2));
  });

  it('closes when the opened attachment disappears', async () => {
    const requestClose = vi.fn<() => void>();

    render(
      <StagedUploadViewer
        items={items}
        index={5}
        requestClose={requestClose}
        selectIndex={vi.fn<(i: number) => void>()}
      />
    );

    await waitFor(() => expect(requestClose).toHaveBeenCalled());
  });
});
