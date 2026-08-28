import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile, remove } from '@tauri-apps/plugin-fs';
import { pickNativeFile } from './nativeFilePicker';

type AndroidUri = { uri: string; documentTopTreeUri: string | null };
type AndroidMetadata =
  | { type: 'File'; name: string; lastModified: Date; byteLength: number; mimeType: string }
  | { type: 'Dir'; name: string; lastModified: Date };

const mocks = vi.hoisted(() => ({
  open: vi.fn<
    (options: {
      pickerMode: 'media' | 'document';
      multiple: true;
    }) => Promise<string | string[] | null>
  >(),
  readFile: vi.fn<(path: string) => Promise<Uint8Array>>(),
  remove: vi.fn<(path: string) => Promise<void>>(),
  androidFs: {
    showOpenFilePicker:
      vi.fn<
        (options: {
          pickerType: 'Gallery' | 'FilePicker';
          mimeTypes: string[];
          multiple: boolean;
        }) => Promise<AndroidUri[]>
      >(),
    getMetadata: vi.fn<(uri: AndroidUri) => Promise<AndroidMetadata>>(),
    readFile: vi.fn<(uri: AndroidUri) => Promise<Uint8Array>>(),
  },
  isAndroidTauri: vi.fn<() => boolean>(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: mocks.open }));
vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: mocks.readFile, remove: mocks.remove }));
vi.mock('tauri-plugin-android-fs-api', () => ({ ...mocks.androidFs }));
vi.mock('$utils/platform', () => ({ isAndroidTauri: mocks.isAndroidTauri }));

const androidUri = (uri: string): AndroidUri => ({ uri, documentTopTreeUri: null });

describe('pickNativeFile', () => {
  beforeEach(() => {
    mocks.isAndroidTauri.mockReturnValue(false);
    mocks.open.mockResolvedValue(null);
    mocks.readFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mocks.remove.mockResolvedValue(undefined);
    mocks.androidFs.showOpenFilePicker.mockResolvedValue([]);
    mocks.androidFs.readFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('on iOS', () => {
    it('opens the native media picker and converts selected files', async () => {
      mocks.open.mockResolvedValue([
        'file:///var/mobile/Library/Caches/My%20photo.JPG',
        'file:///var/mobile/Library/Caches/clip.mp4',
      ]);

      const files = await pickNativeFile('media');

      expect(open).toHaveBeenCalledWith({ pickerMode: 'media', multiple: true });
      expect(files.map(({ name, type }) => ({ name, type }))).toEqual([
        { name: 'My photo.JPG', type: 'image/jpeg' },
        { name: 'clip.mp4', type: 'video/mp4' },
      ]);
    });

    it('deletes the sandbox copies the picker handed over', async () => {
      mocks.open.mockResolvedValue(['/Caches/a.png', '/Caches/b.pdf']);

      await pickNativeFile('document');

      expect(readFile).toHaveBeenCalledWith('/Caches/a.png');
      expect(remove).toHaveBeenCalledWith('/Caches/a.png');
      expect(remove).toHaveBeenCalledWith('/Caches/b.pdf');
    });

    it('reports read failures, keeps readable files and still deletes the copies', async () => {
      const failure = new Error('permission denied');
      mocks.open.mockResolvedValue(['/Caches/readable.png', '/Caches/unreadable.jpg']);
      mocks.readFile.mockResolvedValueOnce(new Uint8Array([1])).mockRejectedValueOnce(failure);
      const onFileFailure = vi.fn<(source: string, error: unknown) => void>();

      const files = await pickNativeFile('media', onFileFailure);

      expect(files).toHaveLength(1);
      expect(files[0]?.name).toBe('readable.png');
      expect(onFileFailure).toHaveBeenCalledWith('/Caches/unreadable.jpg', failure);
      expect(remove).toHaveBeenCalledWith('/Caches/unreadable.jpg');
    });

    it('reports a failed cleanup without dropping the file', async () => {
      const failure = new Error('cleanup failed');
      mocks.open.mockResolvedValue(['/Caches/photo.png']);
      mocks.remove.mockRejectedValue(failure);
      const onFileFailure = vi.fn<(source: string, error: unknown) => void>();

      const files = await pickNativeFile('media', onFileFailure);

      expect(files).toHaveLength(1);
      expect(onFileFailure).toHaveBeenCalledWith('/Caches/photo.png', failure);
    });

    it('does not read files after picker cancellation', async () => {
      const files = await pickNativeFile('media');

      expect(files).toEqual([]);
      expect(readFile).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });

    it('propagates picker errors without attempting another picker', async () => {
      const error = new Error('picker failed');
      mocks.open.mockRejectedValue(error);

      await expect(pickNativeFile('media')).rejects.toBe(error);
      expect(mocks.readFile).not.toHaveBeenCalled();
    });

    it('throws instead of silently dropping entries that are not paths', async () => {
      mocks.open.mockResolvedValue([{ relative: 'file:///photos/img.HEIC' }] as never);

      await expect(pickNativeFile('media')).rejects.toThrow('unusable entries');
      expect(mocks.readFile).not.toHaveBeenCalled();
    });

    it('opens the native document picker for documents', async () => {
      mocks.open.mockResolvedValue('/documents/report.pdf');

      const files = await pickNativeFile('document');

      expect(open).toHaveBeenCalledWith({ pickerMode: 'document', multiple: true });
      expect(files.map(({ name, type }) => ({ name, type }))).toEqual([
        { name: 'report.pdf', type: 'application/pdf' },
      ]);
    });
  });

  describe('on Android', () => {
    beforeEach(() => {
      mocks.isAndroidTauri.mockReturnValue(true);
    });

    it('picks media through the gallery and takes name and mime from the provider', async () => {
      const uri = androidUri('content://media/external/images/media/1000000034');
      mocks.androidFs.showOpenFilePicker.mockResolvedValue([uri]);
      mocks.androidFs.getMetadata.mockResolvedValue({
        type: 'File',
        name: '1000000034.png',
        lastModified: new Date(1700000000000),
        byteLength: 3,
        mimeType: 'image/png',
      });

      const files = await pickNativeFile('media');

      expect(mocks.androidFs.showOpenFilePicker).toHaveBeenCalledWith({
        pickerType: 'Gallery',
        mimeTypes: ['image/*', 'video/*'],
        multiple: true,
      });
      expect(mocks.androidFs.readFile).toHaveBeenCalledWith(uri);
      expect(open).not.toHaveBeenCalled();
      expect(files.map(({ name, type, lastModified }) => ({ name, type, lastModified }))).toEqual([
        { name: '1000000034.png', type: 'image/png', lastModified: 1700000000000 },
      ]);
    });

    it('does not return the same gallery URI twice', async () => {
      const uri = androidUri('content://media/external/images/media/1000000034');
      mocks.androidFs.showOpenFilePicker.mockResolvedValue([uri, uri]);
      mocks.androidFs.getMetadata.mockResolvedValue({
        type: 'File',
        name: '1000000034.png',
        lastModified: new Date(1700000000000),
        byteLength: 3,
        mimeType: 'image/png',
      });

      const files = await pickNativeFile('media');

      expect(files).toHaveLength(1);
      expect(mocks.androidFs.getMetadata).toHaveBeenCalledOnce();
      expect(mocks.androidFs.readFile).toHaveBeenCalledOnce();
    });

    it('picks documents through the file picker', async () => {
      mocks.androidFs.showOpenFilePicker.mockResolvedValue([androidUri('content://docs/1')]);
      mocks.androidFs.getMetadata.mockResolvedValue({
        type: 'File',
        name: 'report.pdf',
        lastModified: new Date(1700000000000),
        byteLength: 3,
        mimeType: 'application/pdf',
      });

      const files = await pickNativeFile('document');

      expect(mocks.androidFs.showOpenFilePicker).toHaveBeenCalledWith({
        pickerType: 'FilePicker',
        mimeTypes: [],
        multiple: true,
      });
      expect(files.map(({ name, type }) => ({ name, type }))).toEqual([
        { name: 'report.pdf', type: 'application/pdf' },
      ]);
    });

    it('falls back to the extension when the provider reports a generic mime type', async () => {
      mocks.androidFs.showOpenFilePicker.mockResolvedValue([androidUri('content://docs/2')]);
      mocks.androidFs.getMetadata.mockResolvedValue({
        type: 'File',
        name: 'sticker.tgs',
        lastModified: new Date(1700000000000),
        byteLength: 3,
        mimeType: 'application/octet-stream',
      });

      const files = await pickNativeFile('document');

      expect(files[0]?.type).toBe('application/x-tgsticker');
    });

    it('reports failures per file and skips directories', async () => {
      const failure = new Error('no read permission');
      const dir = androidUri('content://docs/dir');
      const broken = androidUri('content://docs/broken');
      mocks.androidFs.showOpenFilePicker.mockResolvedValue([dir, broken]);
      mocks.androidFs.getMetadata
        .mockResolvedValueOnce({ type: 'Dir', name: 'folder', lastModified: new Date(0) })
        .mockRejectedValueOnce(failure);
      const onFileFailure = vi.fn<(source: string, error: unknown) => void>();

      const files = await pickNativeFile('document', onFileFailure);

      expect(files).toEqual([]);
      expect(onFileFailure).toHaveBeenCalledWith('content://docs/broken', failure);
      expect(mocks.androidFs.readFile).not.toHaveBeenCalled();
    });

    it('returns no files when the picker is cancelled', async () => {
      const files = await pickNativeFile('media');

      expect(files).toEqual([]);
      expect(mocks.androidFs.getMetadata).not.toHaveBeenCalled();
    });
  });
});
