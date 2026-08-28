import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FileSaver from 'file-saver';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';
import { showToast } from '$state/toast';
import { setMediaEncryption } from '$utils/tauriMediaEncryption';
import {
  downloadJsonFile,
  saveFileToDevice,
  saveMediaToDevice,
  saveMediaToGallery,
} from './download';

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
  fetchMediaBlob: vi.fn<(input: string) => Promise<Blob>>(),
  captureException: vi.fn<(error: unknown, context?: unknown) => void>(),
  setMediaEncryption: vi.fn<() => Promise<boolean>>(),
}));
const { androidFs, save, writeFile } = mocks;

vi.mock('file-saver', () => ({ default: { saveAs: mocks.saveAs } }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}));
vi.mock('@tauri-apps/plugin-os', () => ({ type: mocks.osType }));
vi.mock('@sentry/react', () => ({ captureException: mocks.captureException }));
vi.mock('$state/toast', () => ({ showToast: mocks.showToast }));
vi.mock('$utils/mediaTransport', () => ({ fetchMediaBlob: mocks.fetchMediaBlob }));
vi.mock('$utils/tauriMediaEncryption', () => ({ setMediaEncryption: mocks.setMediaEncryption }));
vi.mock('tauri-plugin-android-fs-api', () => ({
  ...mocks.androidFs,
  PublicGeneralPurposeDir: { Download: 'Download' },
  PublicImageDir: { Pictures: 'Pictures' },
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
  mocks.setMediaEncryption.mockResolvedValue(true);
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

  const uniqueFileError = new Error(
    'Failed to build unique file: /storage/emulated/0/Download/Screenshot 2026-08-13 at 20.07.50.png' +
      ' _display_name=Screenshot 2026-08-13 at 20.07.50.png mime_type=image/png' +
      ' _data=/storage/emulated/0/Download/Screenshot 2026-08-13 at 20.07.50.png relative_path=Download/'
  );

  it('retries the whole save under a unique name when clearing the pending flag fails', async () => {
    androidFs.setPublicFilePending.mockRejectedValueOnce(uniqueFileError);

    const result = await saveFileToDevice(
      new Blob(['data'], { type: 'image/png' }),
      'Screenshot 2026-08-13 at 20.07.50.png'
    );

    expect(result).toBe('saved');
    expect(androidFs.createNewPublicFile).toHaveBeenCalledTimes(2);
    expect(androidFs.createNewPublicFile).toHaveBeenLastCalledWith(
      'Download',
      expect.stringMatching(/^Screenshot 2026-08-13 at 20\.07\.50-\d+\.png$/),
      'image/png',
      { isPending: true, requestPermission: true }
    );
    expect(androidFs.removeFile).toHaveBeenCalledWith('content://download/file');
    expect(showToast).toHaveBeenCalledWith('Saved to Downloads');
  });

  it('reports a scrubbed error to Sentry when the unique-name retry also fails', async () => {
    androidFs.setPublicFilePending.mockRejectedValue(uniqueFileError);

    const result = await saveFileToDevice(
      new Blob(['data'], { type: 'image/png' }),
      'Screenshot 2026-08-13 at 20.07.50.png'
    );

    expect(result).toBe('failed');
    expect(androidFs.createNewPublicFile).toHaveBeenCalledTimes(2);

    const [reported, context] = mocks.captureException.mock.calls[0] as [
      Error,
      { tags: Record<string, string>; extra: Record<string, unknown> },
    ];
    expect(reported.message).toContain('Failed to build unique file');
    expect(reported.message).not.toContain('Screenshot');
    expect(reported.message).not.toContain('20.07.50');
    expect(reported.message).not.toContain('/storage/emulated');
    expect(context.tags).toMatchObject({ feature: 'media-save', target: 'downloads' });
    expect(context.extra).toMatchObject({ mimeType: 'image/png' });
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

  it('uses authenticated media transport before saving a URL in the browser', async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    const blob = new Blob(['data'], { type: 'image/png' });
    mocks.fetchMediaBlob.mockResolvedValue(blob);

    await expect(
      saveFileToDevice(
        'https://matrix.example.org/_matrix/client/v1/media/download/example.org/photo',
        'photo.png'
      )
    ).resolves.toBe('saved');

    expect(mocks.fetchMediaBlob).toHaveBeenCalledWith(
      'https://matrix.example.org/_matrix/client/v1/media/download/example.org/photo'
    );
    expect(FileSaver.saveAs).toHaveBeenCalledWith(blob, 'photo.png');
  });

  it('uses authenticated media transport when saving a URL on Android', async () => {
    const blob = new Blob(['data'], { type: 'image/png' });
    mocks.fetchMediaBlob.mockResolvedValue(blob);

    await expect(
      saveFileToDevice(
        'https://matrix.example.org/_matrix/client/v1/media/download/example.org/photo',
        'photo.png'
      )
    ).resolves.toBe('saved');

    expect(mocks.fetchMediaBlob).toHaveBeenCalledWith(
      'https://matrix.example.org/_matrix/client/v1/media/download/example.org/photo'
    );
  });

  it('uses authenticated media transport when saving a URL on desktop', async () => {
    vi.mocked(osType).mockReturnValue('linux');
    mocks.fetchMediaBlob.mockResolvedValue(new Blob(['data'], { type: 'image/png' }));

    await expect(
      saveFileToDevice(
        'https://matrix.example.org/_matrix/client/v1/media/download/example.org/photo',
        'photo.png'
      )
    ).resolves.toBe('saved');

    expect(mocks.fetchMediaBlob).toHaveBeenCalledWith(
      'https://matrix.example.org/_matrix/client/v1/media/download/example.org/photo'
    );
    expect(invoke).toHaveBeenCalledWith('save_download', {
      filename: 'photo.png',
      bytes: [100, 97, 116, 97],
    });
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

  it('writes all fetched Android image bytes before publishing the gallery file', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    mocks.fetchMediaBlob.mockResolvedValueOnce(new Blob([bytes]));

    await saveMediaToGallery('https://matrix.example.org/photo', 'photo.png', 'image/png');

    expect(androidFs.writeFile).toHaveBeenCalledWith('content://media/image', bytes);
    expect(androidFs.writeFile.mock.invocationCallOrder[0]).toBeLessThan(
      androidFs.setPublicFilePending.mock.invocationCallOrder[0]!
    );
    expect(androidFs.setPublicFilePending).toHaveBeenCalledWith('content://media/image', false);
    expect(mocks.fetchMediaBlob).toHaveBeenCalledWith('https://matrix.example.org/photo');
  });

  it('does not create a gallery file when Android storage permission is denied', async () => {
    androidFs.checkPublicFilesPermission.mockResolvedValue(false);
    androidFs.requestPublicFilesPermission.mockResolvedValue(false);

    await saveMediaToGallery(new Blob(['data']), 'photo.png', 'image/png');

    expect(androidFs.createNewPublicImageFile).not.toHaveBeenCalled();
    expect(androidFs.writeFile).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      'Failed to save to gallery: Storage permission was denied'
    );
  });

  it('does not clean up when Android fails before creating a gallery file', async () => {
    androidFs.createNewPublicImageFile.mockRejectedValue(new Error('create failed'));

    await saveMediaToGallery(new Blob(['data']), 'photo.png', 'image/png');

    expect(androidFs.writeFile).not.toHaveBeenCalled();
    expect(androidFs.removeFile).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Failed to save to gallery: create failed');
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

  it.each([
    ['publishing', 'setPublicFilePending', new Error('publish failed')],
    ['scanning', 'scanPublicFile', new Error('scan failed')],
  ] as const)('cleans up the Android gallery file when %s fails', async (_, method, error) => {
    androidFs[method].mockRejectedValue(error);

    await saveMediaToGallery(new Blob(['data']), 'photo.png', 'image/png');

    expect(androidFs.removeFile).toHaveBeenCalledWith('content://media/image');
    expect(showToast).toHaveBeenCalledWith(`Failed to save to gallery: ${error.message}`);
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

  it('uses authenticated media transport before saving a URL to iOS Photos', async () => {
    vi.mocked(osType).mockReturnValue('ios');
    mocks.fetchMediaBlob.mockResolvedValue(new Blob(['data'], { type: 'image/png' }));

    await saveMediaToGallery(
      'https://matrix.example.org/_matrix/client/v1/media/download/example.org/photo',
      'photo.png',
      'image/png'
    );

    expect(mocks.fetchMediaBlob).toHaveBeenCalledWith(
      'https://matrix.example.org/_matrix/client/v1/media/download/example.org/photo'
    );
    expect(invoke).toHaveBeenCalledWith('save_media_to_photos', {
      filename: 'photo.png',
      mimeType: 'image/png',
      bytes: [100, 97, 116, 97],
    });
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
    mocks.fetchMediaBlob.mockRejectedValueOnce(new Error('network down'));

    await saveMediaToGallery('mxc://example/photo.png', 'photo.png', 'image/png');

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Failed to save to gallery: network down');
    expect(androidFs.createNewPublicImageFile).not.toHaveBeenCalled();
    expect(androidFs.removeFile).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(FileSaver.saveAs).not.toHaveBeenCalled();
  });

  it('does not save an HTTP error response as an Android gallery image', async () => {
    mocks.fetchMediaBlob.mockRejectedValueOnce(new Error('Failed to fetch media: 404 Not Found'));

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
    mocks.fetchMediaBlob.mockRejectedValueOnce(new Error('decode failed'));

    await saveMediaToGallery('mxc://example/photo.png', 'photo.png', 'image/png');

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Failed to save to photos: decode failed');
    expect(invoke).not.toHaveBeenCalled();
    expect(FileSaver.saveAs).not.toHaveBeenCalled();
  });
});

describe('saveMediaToDevice', () => {
  const INNER = 'https://matrix.example.org/_matrix/client/v1/media/download/example.org/report';
  const MEDIA_URL = `sable-media://localhost/${encodeURIComponent(INNER)}?__sable_media_cache=3`;
  const ENC_INFO = { key: { k: 'secret' }, iv: 'iv', hashes: { sha256: 'hash' } } as never;

  const options = (overrides: Record<string, unknown> = {}) => ({
    mediaUrl: MEDIA_URL,
    filename: 'report.pdf',
    mimeType: 'application/pdf',
    loadBlob: vi.fn<() => Promise<Blob>>().mockResolvedValue(new Blob(['pdf'])),
    ...overrides,
  });

  it('saves through the native command on desktop without moving bytes over IPC', async () => {
    vi.mocked(osType).mockReturnValue('linux');
    const opts = options();

    await expect(saveMediaToDevice(opts)).resolves.toBe('saved');

    expect(invoke).toHaveBeenCalledExactlyOnceWith('save_media_download', {
      url: MEDIA_URL,
      filename: 'report.pdf',
    });
    expect(opts.loadBlob).not.toHaveBeenCalled();
    expect(mocks.fetchMediaBlob).not.toHaveBeenCalled();
  });

  it('registers the keys before a native save of encrypted media', async () => {
    vi.mocked(osType).mockReturnValue('linux');
    const opts = options({ encInfo: ENC_INFO });

    await expect(saveMediaToDevice(opts)).resolves.toBe('saved');

    expect(setMediaEncryption).toHaveBeenCalledWith(MEDIA_URL, ENC_INFO, 'application/pdf');
    expect(invoke).toHaveBeenCalledWith('save_media_download', expect.anything());
    expect(opts.loadBlob).not.toHaveBeenCalled();
  });

  it('decrypts in JS when the native handler cannot be given the keys', async () => {
    vi.mocked(osType).mockReturnValue('linux');
    mocks.setMediaEncryption.mockResolvedValue(false);
    const opts = options({ encInfo: ENC_INFO });

    await expect(saveMediaToDevice(opts)).resolves.toBe('saved');

    expect(invoke).not.toHaveBeenCalledWith('save_media_download', expect.anything());
    expect(opts.loadBlob).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith('save_download', expect.anything());
  });

  it('falls back to the blob path and reports when the native save fails', async () => {
    vi.mocked(osType).mockReturnValue('linux');
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'save_media_download') throw new Error('no active media session');
      return true;
    });
    const opts = options();

    await expect(saveMediaToDevice(opts)).resolves.toBe('saved');

    expect(mocks.captureException).toHaveBeenCalledOnce();
    expect(opts.loadBlob).toHaveBeenCalledOnce();
  });

  it('returns cancelled without a toast when the save dialog is dismissed', async () => {
    vi.mocked(osType).mockReturnValue('linux');
    vi.mocked(invoke).mockResolvedValue(false);

    await expect(saveMediaToDevice(options())).resolves.toBe('cancelled');
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('keeps Android on the public Downloads directory instead of the desktop command', async () => {
    vi.mocked(osType).mockReturnValue('android');
    const opts = options();

    await expect(saveMediaToDevice(opts)).resolves.toBe('saved');

    expect(invoke).not.toHaveBeenCalledWith('save_media_download', expect.anything());
    expect(opts.loadBlob).toHaveBeenCalledOnce();
    expect(androidFs.createNewPublicFile).toHaveBeenCalled();
  });

  it('reports and toasts once when the fetch behind the fallback fails', async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    const opts = options({
      loadBlob: vi.fn<() => Promise<Blob>>().mockRejectedValue(new Error('offline')),
    });

    await expect(saveMediaToDevice(opts)).resolves.toBe('failed');

    expect(mocks.captureException).toHaveBeenCalledOnce();
    expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith('Failed to save file: offline');
    expect(FileSaver.saveAs).not.toHaveBeenCalled();
  });
});
