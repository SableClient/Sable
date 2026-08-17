import { describe, expect, it } from 'vitest';
import { getFavoriteGifFromMessageContent } from './favoriteGif';

describe('getFavoriteGifFromMessageContent', () => {
  it('preserves external GIF metadata when favoriting a timeline message', () => {
    expect(
      getFavoriteGifFromMessageContent({
        msgtype: 'm.text',
        body: 'https://klipy.com/gif/reaction',
        'pet.plz.gif': {
          v: 1,
          provider: 'klipy',
          media_url: 'https://static.klipy.com/ii/reaction.gif',
          w: 480,
          h: 270,
          mimetype: 'image/gif',
          size: 1234,
          title: 'Reaction',
          blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
        },
      })
    ).toEqual({
      title: 'Reaction',
      shareUrl: 'https://klipy.com/gif/reaction',
      mediaUrl: 'https://static.klipy.com/ii/reaction.gif',
      width: 480,
      height: 270,
      size: 1234,
      mimetype: 'image/gif',
      blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
    });
  });

  it('keeps standard MXC image favorites on the existing path', () => {
    expect(
      getFavoriteGifFromMessageContent({
        msgtype: 'm.image',
        body: 'Favorite',
        url: 'mxc://example.org/media-id',
        info: { w: 320, h: 240, mimetype: 'image/gif' },
      })
    ).toMatchObject({
      title: 'Favorite',
      shareUrl: 'mxc://example.org/media-id',
      mediaUrl: 'mxc://example.org/media-id',
      width: 320,
      height: 240,
      mimetype: 'image/gif',
    });
  });

  it('uses the decoded media URL for historical Soliditas GIFs', () => {
    expect(
      getFavoriteGifFromMessageContent({
        msgtype: 'm.image',
        body: 'Reaction',
        url: 'mxc://gifs.sable.moe/klipy_ZXhhbXBsZS5naWY',
        info: { w: 480, h: 270, mimetype: 'image/gif' },
      })
    ).toMatchObject({
      title: 'Reaction',
      shareUrl: 'https://static.klipy.com/ii/example.gif',
      mediaUrl: 'https://static.klipy.com/ii/example.gif',
      width: 480,
      height: 270,
    });
  });
});
