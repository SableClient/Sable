import { describe, expect, it } from 'vitest';
import { normalizeFavoriteGifs } from './useFavoriteGifs';

describe('normalizeFavoriteGifs', () => {
  it('migrates old MXC-backed KLIPY favorites to direct media URLs', () => {
    const result = normalizeFavoriteGifs({
      gifs: [
        {
          title: 'Reaction',
          url: 'mxc://gifs.sable.moe/klipy_ZXhhbXBsZS5naWY',
          shareUrl: 'mxc://gifs.sable.moe/klipy_ZXhhbXBsZS5naWY',
          width: 480,
          height: 270,
        },
      ],
    });

    expect(result[0]).toMatchObject({
      title: 'Reaction',
      shareUrl: 'https://static.klipy.com/ii/example.gif',
      mediaUrl: 'https://static.klipy.com/ii/example.gif',
    });
  });

  it('drops unsafe legacy favorites', () => {
    expect(
      normalizeFavoriteGifs({
        gifs: [{ title: 'Tracking GIF', url: 'https://attacker.example/track.gif' }],
      })
    ).toEqual([]);
  });
});
