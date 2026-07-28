import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { pickNativeFile } from './nativeFilePicker';

const mocks = vi.hoisted(() => ({
  open: vi.fn<
    (options: {
      pickerMode: 'media' | 'document';
      multiple: true;
    }) => Promise<string | string[] | null>
  >(),
  readFile: vi.fn<(path: string) => Promise<Uint8Array>>(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: mocks.open }));
vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: mocks.readFile }));

describe('pickNativeFile', () => {
  beforeEach(() => {
    mocks.open.mockResolvedValue(null);
    mocks.readFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('opens the native media picker and converts selected paths to Files', async () => {
    mocks.open.mockResolvedValue(['/photos/My%20photo.JPG', '/videos/clip.mp4']);

    const files = await pickNativeFile('media');

    expect(open).toHaveBeenCalledWith({ pickerMode: 'media', multiple: true });
    expect(readFile).toHaveBeenCalledWith('/photos/My%20photo.JPG');
    expect(readFile).toHaveBeenCalledWith('/videos/clip.mp4');
    expect(files.map(({ name, type }) => ({ name, type }))).toEqual([
      { name: 'My photo.JPG', type: 'image/jpeg' },
      { name: 'clip.mp4', type: 'video/mp4' },
    ]);
  });

  it('returns readable files when an individual read fails', async () => {
    const failure = new Error('permission denied');
    mocks.open.mockResolvedValue(['/photos/readable.png', '/photos/unreadable.jpg']);
    mocks.readFile.mockResolvedValueOnce(new Uint8Array([1])).mockRejectedValueOnce(failure);
    const onReadFailure = vi.fn<(path: string, error: unknown) => void>();

    const files = await pickNativeFile('media', onReadFailure);

    expect(files).toHaveLength(1);
    expect(files[0]?.name).toBe('readable.png');
    expect(onReadFailure).toHaveBeenCalledWith('/photos/unreadable.jpg', failure);
  });

  it('does not read files after picker cancellation', async () => {
    const files = await pickNativeFile('media');

    expect(files).toEqual([]);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('propagates picker errors without attempting another picker', async () => {
    const error = new Error('picker failed');
    mocks.open.mockRejectedValue(error);

    await expect(pickNativeFile('media')).rejects.toBe(error);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('opens the native document picker and converts selected paths to Files', async () => {
    mocks.open.mockResolvedValue('/documents/report.pdf');

    const files = await pickNativeFile('document');

    expect(open).toHaveBeenCalledWith({ pickerMode: 'document', multiple: true });
    expect(readFile).toHaveBeenCalledWith('/documents/report.pdf');
    expect(files.map(({ name, type }) => ({ name, type }))).toEqual([
      { name: 'report.pdf', type: 'application/pdf' },
    ]);
  });
});
