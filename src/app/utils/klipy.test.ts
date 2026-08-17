import { describe, expect, it } from 'vitest';
import { getKlipyGifMetadata, isAllowedKlipyMediaUrl, parseLegacyKlipyGif } from './klipy';

describe('Klipy external GIF metadata', () => {
  const gifUrl = 'https://static.klipy.com/ii/example.gif';

  it('accepts only approved media URLs', () => {
    expect(isAllowedKlipyMediaUrl(gifUrl)).toBe(true);
    expect(isAllowedKlipyMediaUrl('https://static.klipy.com.attacker.example/ii/a.gif')).toBe(
      false
    );
    expect(isAllowedKlipyMediaUrl('https://static.klipy.com:8443/ii/a.gif')).toBe(false);
    expect(isAllowedKlipyMediaUrl('https://user:pass@static.klipy.com/ii/a.gif')).toBe(false);
  });

  it('builds direct-link metadata without an MXC', () => {
    expect(
      getKlipyGifMetadata({
        id: 'id',
        title: 'Reaction',
        mediaUrl: gifUrl,
        shareUrl: 'https://klipy.com/gif/id',
        width: 480,
        height: 270,
        mimetype: 'image/gif',
      })
    ).toMatchObject({
      v: 1,
      provider: 'klipy',
      media_url: gifUrl,
      w: 480,
      h: 270,
    });
  });

  it('serializes large provider IDs as strings', () => {
    const metadata = getKlipyGifMetadata({
      id: 9188075299582436,
      title: 'Reaction',
      mediaUrl: gifUrl,
      shareUrl: gifUrl,
      width: 480,
      height: 270,
    } as unknown as Parameters<typeof getKlipyGifMetadata>[0]);

    expect(metadata?.id).toBe('9188075299582436');
  });

  it('decodes historical Soliditas MXC events to external GIF metadata', () => {
    expect(
      parseLegacyKlipyGif({
        msgtype: 'm.image',
        body: 'Reaction',
        url: 'mxc://gifs.sable.moe/klipy_ZXhhbXBsZS5naWY',
        info: { w: 480, h: 270, mimetype: 'image/gif' },
      })
    ).toMatchObject({
      provider: 'klipy',
      media_url: gifUrl,
      w: 480,
      h: 270,
      title: 'Reaction',
    });
  });

  it('shares the inbound dimension limit on outgoing metadata', () => {
    expect(
      getKlipyGifMetadata({
        id: 'id',
        title: 'Too large',
        mediaUrl: gifUrl,
        shareUrl: gifUrl,
        width: 8193,
        height: 270,
      })
    ).toBeUndefined();
  });
});
