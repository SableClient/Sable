import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FileSaver from 'file-saver';
import { ImageViewer } from './ImageViewer';

const downloadMedia = vi.fn();

vi.mock('$hooks/useImageGestures', () => ({
  useImageGestures: () => ({
    transforms: { zoom: 1, pan: { x: 0, y: 0 } },
    cursor: 'grab',
    handleWheel: vi.fn(),
    onPointerDown: vi.fn(),
    resetTransforms: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
  }),
}));

vi.mock('$utils/matrix', () => ({
  downloadMedia: (...args: unknown[]) => downloadMedia(...args),
}));

vi.mock('file-saver', () => ({
  default: {
    saveAs: vi.fn(),
  },
}));

describe('ImageViewer', () => {
  it('downloads media without passing a media token argument', async () => {
    downloadMedia.mockResolvedValue(new Blob(['image']));

    render(
      <ImageViewer alt="kitten.png" src="https://example.org/kitten.png" requestClose={vi.fn()} />
    );

    fireEvent.click(screen.getByText('Download'));

    await waitFor(() => {
      expect(downloadMedia).toHaveBeenCalledWith('https://example.org/kitten.png');
    });
    expect(FileSaver.saveAs).toHaveBeenCalledWith(expect.any(Blob), 'kitten.png');
  });
});
