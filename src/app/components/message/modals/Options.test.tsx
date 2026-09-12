import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as matrix from '$utils/matrix';
import * as dom from '$utils/dom';
import * as download from '$utils/download';
import type { MatrixClient } from '$types/matrix-sdk';
import { FALLBACK_MIMETYPE } from '$utils/mimeTypes';
import {
  copyImageFromSrcToClipboard,
  copyMessageImageToClipboard,
  resolveImageSaveFilename,
  saveImageFromSrcToDevice,
  saveMessageImageToDevice,
} from './Options';

vi.mock('$utils/matrix', () => ({
  mxcUrlToHttp: vi.fn<() => string | undefined>(() => 'https://media.example/resolved'),
  downloadMedia: vi.fn<() => Promise<Blob>>(async () => new Blob(['img'], { type: 'image/png' })),
  downloadEncryptedMedia: vi.fn<
    (src: string, decrypt: (buf: ArrayBuffer) => Promise<Blob>) => Promise<Blob>
  >((_src, decrypt) => decrypt(new ArrayBuffer(8))),
  decryptFile: vi.fn<(buf: ArrayBuffer, type: string) => Promise<Blob>>(
    async (_buf, type) => new Blob(['dec'], { type })
  ),
}));

vi.mock('$utils/dom', () => ({
  copyToClipboard: vi.fn<() => Promise<boolean>>(async () => true),
  copyImageToClipboard: vi.fn<() => Promise<boolean>>(async () => true),
}));

vi.mock('$utils/download', () => ({
  getDownloadFilename: vi.fn<
    (filename: unknown, body?: unknown, fallback?: string, mimeType?: string) => string
  >((filename, body, fallback) => {
    const primary = typeof filename === 'string' && filename ? filename : undefined;
    const secondary = typeof body === 'string' && body ? body : undefined;
    return primary ?? secondary ?? fallback ?? 'image';
  }),
  saveFileToDevice: vi.fn<
    (input: Blob | string, filename: string, mimeType?: string) => Promise<string>
  >(async () => 'saved'),
}));

const mx = {} as MatrixClient;
const encFile = {
  url: 'mxc://example.org/enc',
  key: { kty: 'oct', k: 'key', alg: 'A256CTR' },
  iv: 'iv',
  hashes: { sha256: 'hash' },
  v: 'v2',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('copyMessageImageToClipboard', () => {
  it('downloads and copies an unencrypted mxc image', async () => {
    await copyMessageImageToClipboard(mx, true, {
      msgtype: 'm.image',
      url: 'mxc://example.org/a',
      info: { mimetype: 'image/jpeg' },
    });

    expect(matrix.mxcUrlToHttp).toHaveBeenCalledWith(mx, 'mxc://example.org/a', true);
    expect(matrix.downloadMedia).toHaveBeenCalledWith('https://media.example/resolved');
    expect(matrix.downloadEncryptedMedia).not.toHaveBeenCalled();
    expect(dom.copyImageToClipboard).toHaveBeenCalledWith(expect.any(Blob));
  });

  it('decrypts and copies an encrypted image', async () => {
    await copyMessageImageToClipboard(mx, true, {
      msgtype: 'm.image',
      url: 'mxc://example.org/a',
      file: encFile,
      info: { mimetype: 'image/png' },
    });

    expect(matrix.downloadMedia).not.toHaveBeenCalled();
    expect(matrix.downloadEncryptedMedia).toHaveBeenCalledTimes(1);
    expect(matrix.decryptFile).toHaveBeenCalledWith(expect.any(ArrayBuffer), 'image/png', encFile);
    expect(dom.copyImageToClipboard).toHaveBeenCalledWith(expect.any(Blob));
  });

  it('falls back to the default mimetype when the info block is missing', async () => {
    await copyMessageImageToClipboard(mx, true, {
      msgtype: 'm.image',
      url: 'mxc://example.org/a',
      file: encFile,
    });

    expect(matrix.decryptFile).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      FALLBACK_MIMETYPE,
      encFile
    );
  });

  it('does nothing for non-mxc urls', async () => {
    await copyMessageImageToClipboard(mx, true, {
      msgtype: 'm.image',
      url: 'https://example.org/not-media.png',
    });

    expect(matrix.mxcUrlToHttp).not.toHaveBeenCalled();
    expect(matrix.downloadMedia).not.toHaveBeenCalled();
    expect(dom.copyImageToClipboard).not.toHaveBeenCalled();
  });

  it('throws when the clipboard write fails', async () => {
    vi.mocked(dom.copyImageToClipboard).mockResolvedValueOnce(false);

    await expect(
      copyMessageImageToClipboard(mx, true, {
        msgtype: 'm.image',
        url: 'mxc://example.org/a',
      })
    ).rejects.toThrow('Failed to write to clipboard');
  });
});

describe('saveMessageImageToDevice', () => {
  it('downloads and saves an image with a filename from the content', async () => {
    await saveMessageImageToDevice(mx, true, {
      msgtype: 'm.image',
      url: 'mxc://example.org/a',
      info: { filename: 'photo.png' },
    });

    expect(matrix.downloadMedia).toHaveBeenCalledWith('https://media.example/resolved');
    expect(download.getDownloadFilename).toHaveBeenCalledWith(
      'photo.png',
      undefined,
      'image',
      'image/png'
    );
    expect(download.saveFileToDevice).toHaveBeenCalledWith(expect.any(Blob), 'photo.png');
  });

  it('does nothing for non-mxc urls', async () => {
    await saveMessageImageToDevice(mx, true, {
      msgtype: 'm.image',
      url: 'https://example.org/not-media.png',
    });

    expect(matrix.downloadMedia).not.toHaveBeenCalled();
    expect(download.saveFileToDevice).not.toHaveBeenCalled();
  });
});

describe('copyImageFromSrcToClipboard', () => {
  it('downloads the given src and copies it', async () => {
    await copyImageFromSrcToClipboard('https://example.org/image.png');

    expect(matrix.downloadMedia).toHaveBeenCalledWith('https://example.org/image.png');
    expect(dom.copyImageToClipboard).toHaveBeenCalledWith(expect.any(Blob));
  });

  it('throws when the clipboard write fails', async () => {
    vi.mocked(dom.copyImageToClipboard).mockResolvedValueOnce(false);

    await expect(copyImageFromSrcToClipboard('https://example.org/image.png')).rejects.toThrow(
      'Failed to write to clipboard'
    );
  });
});

describe('saveImageFromSrcToDevice', () => {
  it('downloads the given src and saves the URL basename as the filename', async () => {
    await saveImageFromSrcToDevice('https://example.org/path/to/photo.png?w=100');

    expect(matrix.downloadMedia).toHaveBeenCalledWith(
      'https://example.org/path/to/photo.png?w=100'
    );
    expect(download.saveFileToDevice).toHaveBeenCalledWith(expect.any(Blob), 'photo.png');
  });

  it('decodes a sable-media src and saves the media id as the filename', async () => {
    const encoded = encodeURIComponent(
      'https://media.example/_matrix/client/v1/media/download/server/2026-08-09_abc?allow_redirect=true'
    );
    const src = `sable-media://${encoded}`;

    await saveImageFromSrcToDevice(src);

    expect(matrix.downloadMedia).toHaveBeenCalledWith(src);
    expect(download.saveFileToDevice).toHaveBeenCalledWith(expect.any(Blob), '2026-08-09_abc');
  });

  it('decodes a sable-media.localhost src and saves the media id as the filename', async () => {
    const encoded = encodeURIComponent(
      'https://media.example/_matrix/client/v1/media/download/server/2026-08-09_abc?allow_redirect=true'
    );
    const src = `https://sable-media.localhost/${encoded}?__sable_media_cache=3&__sable_media_session=anon`;

    await saveImageFromSrcToDevice(src);

    expect(matrix.downloadMedia).toHaveBeenCalledWith(src);
    expect(download.saveFileToDevice).toHaveBeenCalledWith(expect.any(Blob), '2026-08-09_abc');
  });
});

describe('resolveImageSaveFilename', () => {
  const src = 'https://sable-media.localhost/https%3A%2F%2Fmedia.example%2Fimg%2F2026-08-09_abc';

  it('prefers the image title over the URL basename', () => {
    expect(
      resolveImageSaveFilename(
        { isAttachment: false, src, title: 'Six Moments musicaux op. 16 | HN1492' },
        'image/jpeg'
      )
    ).toBe('Six Moments musicaux op. 16 | HN1492');
  });

  it('falls back to the URL basename when there is no title', () => {
    expect(resolveImageSaveFilename({ isAttachment: false, src }, 'image/jpeg')).toBe(
      '2026-08-09_abc'
    );
  });

  it('uses the generic fallback for a deliberate message menu open', () => {
    expect(resolveImageSaveFilename('message', 'image/png')).toBe('image');
  });
});
