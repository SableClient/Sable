import { describe, expect, it } from 'vitest';
import { parseExternalGif } from './externalGif';

const content = {
  msgtype: 'm.text',
  body: 'https://klipy.com/gif/id',
  'pet.plz.gif': {
    v: 1,
    provider: 'klipy',
    media_url: 'https://static.klipy.com/ii/example.gif',
    w: 480,
    h: 270,
  },
};

describe('parseExternalGif', () => {
  it('parses valid provider metadata', () => {
    expect(parseExternalGif(content)).toMatchObject(content['pet.plz.gif']);
  });

  it('fails closed for unsupported versions, dimensions, and hosts', () => {
    expect(
      parseExternalGif({ ...content, 'pet.plz.gif': { ...content['pet.plz.gif'], v: 2 } })
    ).toBe(undefined);
    expect(
      parseExternalGif({
        ...content,
        'pet.plz.gif': { ...content['pet.plz.gif'], w: 0 },
      })
    ).toBeUndefined();
    expect(
      parseExternalGif({
        ...content,
        'pet.plz.gif': {
          ...content['pet.plz.gif'],
          media_url: 'https://attacker.example/track.gif',
        },
      })
    ).toBeUndefined();
  });
});
