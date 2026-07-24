import { describe, expect, it } from 'vitest';
import { getKlipyMxcUrl, getSendableKlipyMxcUrl } from './klipy';

describe('getKlipyMxcUrl', () => {
  const gifUrl = 'https://static.klipy.com/ii/example.gif';

  it('does not create an MXC URL without a proxy', () => {
    expect(getKlipyMxcUrl(gifUrl)).toBe(gifUrl);
    expect(getSendableKlipyMxcUrl(gifUrl)).toBeUndefined();
    expect(getSendableKlipyMxcUrl(gifUrl, '   ')).toBeUndefined();
  });

  it('allows an existing MXC favorite without a proxy', () => {
    expect(getSendableKlipyMxcUrl('mxc://example.org/existing')).toBe('mxc://example.org/existing');
  });

  it('creates an MXC URL when a proxy is configured', () => {
    expect(getKlipyMxcUrl(gifUrl, 'media.example.org')).toMatch(
      /^mxc:\/\/media\.example\.org\/klipy_[A-Za-z0-9_-]+$/
    );
    expect(getSendableKlipyMxcUrl(gifUrl, 'media.example.org')).toMatch(
      /^mxc:\/\/media\.example\.org\/klipy_[A-Za-z0-9_-]+$/
    );
  });
});
