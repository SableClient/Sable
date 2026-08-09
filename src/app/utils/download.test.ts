import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FileSaver from 'file-saver';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';
import { showToast } from '$state/toast';
import { downloadJsonFile, saveFileToDevice, saveMediaToGallery } from './download';

const mocks = vi.hoisted(() => ({
  androidFs: {
    checkPublicFilesPermission: vi.fn<() => Promise<boolean>>(),
    requestPublicFilesPermission: vi.fn<() => Promise<boolean>>(),
    createNewPublicFile: vi.fn<() => Promise<string>>(),
    createNewPublicImageFile: vi.fn<() => Promise<string>>(),
    writeFile: vi.fn<() => Promise<void>>(),
    setPublicFilePending: vi.fn<() => Promise<void>>(),
    scanPublicFile: vi.fn<() => Promise<void>>(),
    removeFile: vi.fn<() => Promise<void>>(),
  },
  save: vi.fn<(options?: { defaultPath?: string }) => Promise<string | null>>(),
  writeFile: vi.fn<(path: string | URL, data: Uint8Array) => Promise<void>>(),
  saveAs: vi.fn<(data: Blob | string, filename?: string) => void>(),
  invoke: vi.fn<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>(),
  isTauri: vi.fn<() => boolean>(),
  osType: vi.fn<() => string>(),
  showToast: vi.fn<(text: string, durationMs?: number) => void>(),
  fetch: vi.fn<(input: string) => Promise<Response>>(),
}));
const { androidFs, save, writeFile } = mocks;

vi.mock('file-saver', () => ({ default: { saveAs: mocks.saveAs } }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}));
vi.mock('@tauri-apps/plugin-os', () => ({ type: mocks.osType }));
vi.mock('$state/toast', () => ({ showToast: mocks.showToast }));
vi.mock('$utils/fetch', () => ({ fetch: mocks.fetch }));
vi.mock('tauri-plugin-android-fs-api', () => ({
  AndroidFs: mocks.androidFs,
  AndroidPublicGeneralPurposeDir: { Download: 'Download' },
  AndroidPublicImageDir: { Pictures: 'Pictures' },
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: mocks.writeFile }));

beforeEach(() => {
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(osType).mockReturnValue('android');
  vi.mocked(invoke).mockResolvedValue(true);
  androidFs.checkPublicFilesPermission.mockResolvedValue(true);
  androidFs.requestPublicFilesPermission.mockResolvedValue(true);
  androidFs.createNewPublicFile.mockResolvedValue('content://download/file');
  androidFs.createNewPublicImageFile.mockResolvedValue('content://media/image');
  androidFs.writeFile.mockResolvedValue(undefined);
  androidFs.setPublicFilePending.mockResolvedValue(undefined);
  androidFs.scanPublicFile.mockResolvedValue(undefined);
  androidFs.removeFile.mockResolvedValue(undefined);
  save.mockResolvedValue(null);
  writeFile.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('saveFileToDevice', () => {
  it('scans an Android Downloads file after making it public', async () => {
    const result = await saveFileToDevice(new Blob(['data'], { type: 'text/plain' }), 'file.txt');

    expect(result).toBe('saved');
    expect(androidFs.createNewPublicFile).toHaveBeenCalledWith(
      'Download',
      'file.txt',
      'text/plain',
      { isPending: true, requestPermission: true }
    );
    expect(androidFs.setPublicFilePending).toHaveBeenCalledWith('content://download/file', false);
    expect(androidFs.scanPublicFile).toHaveBeenCalledWith('content://download/file');
    expect(showToast).toHaveBeenCalledWith('Saved to Downloads');
  });

  it('cleans up an Android file and shows an error toast when writing fails', async () => {
    const error = new Error('write failed');
    androidFs.writeFile.mockRejectedValue(error);

    const result = await saveFileToDevice(new Blob(['data']), 'file.txt');

    expect(result).toBe('failed');
    expect(androidFs.removeFile).toHaveBeenCalledWith('content://download/file');
    expect(showToast).toHaveBeenCalledWith('Failed to save file: write failed');
  });

  it('does not write or toast when the iOS save picker is cancelled', async () => {
    vi.mocked(osType).mockReturnValue('ios');

    const result = await saveFileToDevice(new Blob(['data']), 'file.txt');

    expect(result).toBe('cancelled');
    expect(save).toHaveBeenCalledWith({ defaultPath: 'file.txt' });
    expect(writeFile).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('writes the selected iOS path and shows the success toast', async () => {
    vi.mocked(osType).mockReturnValue('ios');
    save.mockResolvedValue('file:///exports/file.txt');

    const result = await saveFileToDevice(new Blob(['data']), 'file.txt');

    expect(result).toBe('saved');
    expect(writeFile).toHaveBeenCalledWith('file:///exports/file.txt', expect.any(Uint8Array));
    expect(showToast).toHaveBeenCalledWith('File saved');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('keeps browser downloads on FileSaver', async () => {
    vi.mocked(isTauri).mockReturnValue(false);

    const result = await saveFileToDevice(new Blob(['data']), 'file.txt');

    expect(result).toBe('saved');
    expect(FileSaver.saveAs).toHaveBeenCalledWith(expect.any(Blob), 'file.txt');
  });
});

describe('downloadJsonFile', () => {
  it('saves through the native desktop command instead of an anchor click', async () => {
    vi.mocked(osType).mockReturnValue('linux');

    const result = await downloadJsonFile('{"a":1}', 'persona');

    expect(result).toBe('saved');
    expect(invoke).toHaveBeenCalledWith('save_download', {
      filename: expect.stringMatching(/^persona-\d+\.json$/),
      bytes: expect.any(Array),
    });
    expect(FileSaver.saveAs).not.toHaveBeenCalled();
  });

  it('routes Android exports to the public Downloads directory', async () => {
    const result = await downloadJsonFile('{"a":1}', 'persona');

    expect(result).toBe('saved');
    expect(androidFs.createNewPublicFile).toHaveBeenCalledWith(
      'Download',
      expect.stringMatching(/^persona-\d+\.json$/),
      'application/json',
      { isPending: true, requestPermission: true }
    );
  });
});

describe('saveMediaToGallery', () => {
  it('saves Android images to Pictures through the public image API', async () => {
    await saveMediaToGallery(new Blob(['data']), 'photo.png', 'image/png');

    expect(androidFs.createNewPublicImageFile).toHaveBeenCalledWith(
      'Pictures',
      'photo.png',
      'image/png',
      { isPending: true, requestPermission: true }
    );
    expect(androidFs.writeFile).toHaveBeenCalledWith(
      'content://media/image',
      expect.any(Uint8Array)
    );
    expect(androidFs.setPublicFilePending).toHaveBeenCalledWith('content://media/image', false);
    expect(androidFs.scanPublicFile).toHaveBeenCalledWith('content://media/image');
    expect(showToast).toHaveBeenCalledWith('Saved to Gallery');
  });

  it('rejects video media explicitly without touching any backend or falling back', async () => {
    await expect(saveMediaToGallery(new Blob(['data']), 'clip.mp4', 'video/mp4')).rejects.toThrow(
      'Only image media can be saved to the gallery'
    );

    expect(androidFs.createNewPublicImageFile).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(FileSaver.saveAs).not.toHaveBeenCalled();
  });

  it('cleans up the pending Android gallery file and does not fall back when writing fails', async () => {
    androidFs.writeFile.mockRejectedValue(new Error('write failed'));

    await saveMediaToGallery(new Blob(['data']), 'photo.png', 'image/png');

    expect(androidFs.removeFile).toHaveBeenCalledWith('content://media/image');
    expect(showToast).toHaveBeenCalledWith('Failed to save to gallery: write failed');
    expect(invoke).not.toHaveBeenCalled();
    expect(FileSaver.saveAs).not.toHaveBeenCalled();
  });

  it('sends media bytes to the native Photos command on iOS', async () => {
    vi.mocked(osType).mockReturnValue('ios');

    await saveMediaToGallery(new Blob(['data']), 'photo.png', 'image/png');

    expect(invoke).toHaveBeenCalledWith('save_media_to_photos', {
      filename: 'photo.png',
      mimeType: 'image/png',
      bytes: [100, 97, 116, 97],
    });
    expect(showToast).toHaveBeenCalledWith('Saved to Photos');
    expect(androidFs.createNewPublicImageFile).not.toHaveBeenCalled();
  });

  it('shows a failure toast when the iOS Photos command rejects', async () => {
    vi.mocked(osType).mockReturnValue('ios');
    vi.mocked(invoke).mockRejectedValue(new Error('photos unavailable'));

    await saveMediaToGallery(new Blob(['data']), 'photo.png', 'image/png');

    expect(showToast).toHaveBeenCalledWith('Failed to save to photos: photos unavailable');
  });

  it('rejects non-media types without touching any backend', async () => {
    await expect(
      saveMediaToGallery(new Blob(['data']), 'doc.pdf', 'application/pdf')
    ).rejects.toThrow('Only image media can be saved to the gallery');

    expect(androidFs.createNewPublicImageFile).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('rejects on desktop platforms and in the browser instead of falling back', async () => {
    vi.mocked(osType).mockReturnValue('macos');
    await expect(saveMediaToGallery(new Blob(['data']), 'photo.png', 'image/png')).rejects.toThrow(
      /not supported/
    );

    vi.mocked(isTauri).mockReturnValue(false);
    await expect(saveMediaToGallery(new Blob(['data']), 'photo.png', 'image/png')).rejects.toThrow(
      /only available/
    );

    expect(invoke).not.toHaveBeenCalled();
    expect(FileSaver.saveAs).not.toHaveBeenCalled();
  });

  it('shows exactly one gallery failure toast when fetching the media fails on Android', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('network down'));

    await saveMediaToGallery('mxc://example/photo.png', 'photo.png', 'image/png');

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Failed to save to gallery: network down');
    expect(androidFs.createNewPublicImageFile).not.toHaveBeenCalled();
    expect(androidFs.removeFile).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(FileSaver.saveAs).not.toHaveBeenCalled();
  });

  it('does not save an HTTP error response as an Android gallery image', async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response('not found', { status: 404, statusText: 'Not Found' })
    );

    await saveMediaToGallery('mxc://example/missing.png', 'missing.png', 'image/png');

    expect(showToast).toHaveBeenCalledWith(
      'Failed to save to gallery: Failed to fetch media: 404 Not Found'
    );
    expect(androidFs.createNewPublicImageFile).not.toHaveBeenCalled();
    expect(androidFs.writeFile).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('shows exactly one photos failure toast when blob conversion fails on iOS', async () => {
    vi.mocked(osType).mockReturnValue('ios');
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.reject(new Error('decode failed')),
    } as unknown as Response);

    await saveMediaToGallery('mxc://example/photo.png', 'photo.png', 'image/png');

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Failed to save to photos: decode failed');
    expect(invoke).not.toHaveBeenCalled();
    expect(FileSaver.saveAs).not.toHaveBeenCalled();
  });
});
