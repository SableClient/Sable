import { describe, expect, it } from 'vitest';
import { isAllowedKlipyMediaUrl, parseLegacyKlipyGif } from './klipy';

describe('legacy Klipy external GIF rendering', () => {
  const gifUrl = 'https://static.klipy.com/ii/example.gif';

  it('accepts only approved media URLs', () => {
    expect(isAllowedKlipyMediaUrl(gifUrl)).toBe(true);
    expect(isAllowedKlipyMediaUrl('https://static.klipy.com.attacker.example/ii/a.gif')).toBe(
      false
    );
    expect(isAllowedKlipyMediaUrl('https://static.klipy.com:8443/ii/a.gif')).toBe(false);
    expect(isAllowedKlipyMediaUrl('https://user:pass@static.klipy.com/ii/a.gif')).toBe(false);
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
});
