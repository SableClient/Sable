import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as MatrixUtils from '$utils/matrix';
import { MsgType, type MatrixClient } from '$types/matrix-sdk';
import type { TUploadItem } from '$state/room/roomInputDrafts';
import { TGS_MIMETYPE } from '$utils/mimeTypes';
import { MATRIX_UNSTABLE_SPOILER_PROPERTY_NAME } from '$unstable/prefixes';
import { getGalleryItemContent, getGifMsgContent, getImageMsgContent } from './msgContent';

const { fetchMock, uploadMock, encryptFileMock } = vi.hoisted(() => ({
  fetchMock: vi.fn<(url: string) => Promise<Response>>(),
  uploadMock: vi.fn<(mx: unknown, file: File) => Promise<{ content_uri?: string }>>(),
  encryptFileMock: vi.fn<(file: File) => Promise<{ file: File; encInfo: object }>>(),
}));

vi.mock('$utils/fetch', () => ({ fetch: fetchMock }));
vi.mock('$utils/matrix', async (importOriginal) => ({
  ...(await importOriginal<typeof MatrixUtils>()),
  uploadContentToServer: uploadMock,
  encryptFile: encryptFileMock,
}));

beforeEach(() => {
  fetchMock.mockReset();
  uploadMock.mockReset();
  encryptFileMock.mockReset();
});

vi.mock('$utils/dom', () => ({
  getImageFileUrl: vi.fn<(file: File | Blob) => string>(() => 'blob:test'),
  loadImageElement: vi
    .fn<(url: string) => Promise<HTMLImageElement>>()
    .mockRejectedValue(new Error('TGS is not a native image')),
}));

const createTgsItem = (): TUploadItem => {
  const file = new File(['tgs'], 'sticker.tgs', { type: TGS_MIMETYPE });
  return {
    file,
    originalFile: file,
    encInfo: undefined,
    metadata: { markedAsSpoiler: false },
  };
};

describe('object URL cleanup', () => {
  it('revokes the object URL after loading the image fails', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    await getImageMsgContent({} as MatrixClient, createTgsItem(), 'mxc://revoke');
    expect(revokeSpy).toHaveBeenCalledWith('blob:test');
    revokeSpy.mockRestore();
  });
});

describe('TGS message content', () => {
  it('sends TGS uploads as images with their MIME metadata', async () => {
    const content = await getImageMsgContent({} as MatrixClient, createTgsItem(), 'mxc://sticker');

    expect(content).toMatchObject({
      msgtype: MsgType.Image,
      body: 'sticker.tgs',
      url: 'mxc://sticker',
      info: {
        mimetype: TGS_MIMETYPE,
        size: 3,
      },
    });
  });

  it('classifies TGS gallery uploads as images', async () => {
    const content = await getGalleryItemContent(
      {} as MatrixClient,
      createTgsItem(),
      'mxc://sticker'
    );

    expect(content.itemtype).toBe(MsgType.Image);
  });
});

const proxyId = (prefix: string, payload: string) =>
  `mxc://gifs.sable.moe/${prefix}_${btoa(payload).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`;

describe('GIF message content', () => {
  const searchResult = {
    id: 'gif-id',
    title: 'Reaction',
    shareUrl: 'https://tenor.com/view/gif-id',
    mediaUrl: 'https://media.tenor.com/AbCdEf123/reaction.gif',
    width: 480,
    height: 270,
    mimetype: 'image/gif',
  };

  it('sends a proxy mxc url without fetching or uploading the gif', async () => {
    const content = await getGifMsgContent(searchResult, { proxyUrl: 'gifs.sable.moe' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(encryptFileMock).not.toHaveBeenCalled();
    expect(content).toEqual({
      msgtype: MsgType.Image,
      body: 'Reaction.gif',
      url: proxyId('tenor', 'AbCdEf123'),
      info: { w: 480, h: 270, mimetype: 'image/gif' },
    });
  });

  it('marks Giphy gifs as webp because that is what the proxy serves', async () => {
    const content = await getGifMsgContent(
      {
        ...searchResult,
        id: 'l0MYt5jPR6QX5pnqM',
        mediaUrl: 'https://media0.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
      },
      { proxyUrl: 'gifs.sable.moe' }
    );

    expect(content).toMatchObject({
      body: 'Reaction.webp',
      url: proxyId('giphy', 'l0MYt5jPR6QX5pnqM'),
      info: { mimetype: 'image/webp' },
    });
  });

  it('encodes the Klipy cdn path after /ii/', async () => {
    const content = await getGifMsgContent(
      { ...searchResult, mediaUrl: 'https://static.klipy.com/ii/abc/e8/3a/x.gif' },
      { proxyUrl: 'gifs.sable.moe' }
    );

    expect(content?.url).toBe(proxyId('klipy', 'abc/e8/3a/x.gif'));
  });

  it('sends favorited homeserver gifs unchanged', async () => {
    const content = await getGifMsgContent(
      { ...searchResult, mediaUrl: 'mxc://matrix.example/media-id' },
      { proxyUrl: 'gifs.sable.moe', spoiler: true }
    );

    expect(content).toMatchObject({
      url: 'mxc://matrix.example/media-id',
      [MATRIX_UNSTABLE_SPOILER_PROPERTY_NAME]: true,
    });
  });

  it('refuses to send when no proxy is configured or the host is unknown', async () => {
    await expect(getGifMsgContent(searchResult, {})).resolves.toBeUndefined();
    await expect(
      getGifMsgContent(
        { ...searchResult, mediaUrl: 'https://media.tenor.com.attacker.example/a/x.gif' },
        { proxyUrl: 'gifs.sable.moe' }
      )
    ).resolves.toBeUndefined();
  });
});
