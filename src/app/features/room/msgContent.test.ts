import { describe, expect, it, vi } from 'vitest';
import { MsgType, type MatrixClient } from '$types/matrix-sdk';
import type { TUploadItem } from '$state/room/roomInputDrafts';
import { TGS_MIMETYPE } from '$utils/mimeTypes';
import { getGalleryItemContent, getGifMsgContent, getImageMsgContent } from './msgContent';

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

describe('KLIPY message content', () => {
  it('sends a direct-link text event without fetching media', () => {
    expect(
      getGifMsgContent({
        id: 'gif-id',
        title: 'Reaction',
        shareUrl: 'https://klipy.com/gif/gif-id',
        mediaUrl: 'https://static.klipy.com/ii/reaction.gif',
        width: 480,
        height: 270,
        mimetype: 'image/gif',
      })
    ).toEqual({
      msgtype: MsgType.Text,
      body: 'https://klipy.com/gif/gif-id',
      'pet.plz.gif': {
        v: 1,
        provider: 'klipy',
        media_url: 'https://static.klipy.com/ii/reaction.gif',
        w: 480,
        h: 270,
        mimetype: 'image/gif',
        id: 'gif-id',
        title: 'Reaction',
      },
    });
  });

  it('keeps Matrix MXC favorites on the standard image path', () => {
    expect(
      getGifMsgContent({
        id: 'matrix-gif',
        title: 'Favorite',
        shareUrl: 'mxc://matrix.example/media-id',
        mediaUrl: 'mxc://matrix.example/media-id',
        width: 320,
        height: 240,
        mimetype: 'image/gif',
      })
    ).toMatchObject({
      msgtype: MsgType.Image,
      body: 'Favorite',
      url: 'mxc://matrix.example/media-id',
      info: {
        w: 320,
        h: 240,
        mimetype: 'image/gif',
      },
    });
  });
});
