import { describe, it, expect } from 'vitest';
import {
  getBlobSafeMimeType,
  mimeTypeToExt,
  getFileNameExt,
  getFileNameWithoutExt,
  FALLBACK_MIMETYPE,
} from './mimeTypes';

describe('getBlobSafeMimeType', () => {
  it('passes through known image types', () => {
    expect(getBlobSafeMimeType('image/jpeg')).toBe('image/jpeg');
    expect(getBlobSafeMimeType('image/png')).toBe('image/png');
    expect(getBlobSafeMimeType('image/webp')).toBe('image/webp');
  });

  it('passes through known video and audio types', () => {
    expect(getBlobSafeMimeType('video/mp4')).toBe('video/mp4');
    expect(getBlobSafeMimeType('audio/mpeg')).toBe('audio/mpeg');
  });

  it('converts video/quicktime to video/mp4', () => {
    expect(getBlobSafeMimeType('video/quicktime')).toBe('video/mp4');
  });

  it('returns fallback for unknown mime types', () => {
    expect(getBlobSafeMimeType('application/x-unknown')).toBe(FALLBACK_MIMETYPE);
    expect(getBlobSafeMimeType('image/bmp')).toBe(FALLBACK_MIMETYPE);
  });

  it('strips charset parameter before checking allowlist', () => {
    expect(getBlobSafeMimeType('text/plain; charset=utf-8')).toBe('text/plain');
  });

  it('returns fallback for non-string input', () => {
    // @ts-expect-error — testing runtime safety for external data
    expect(getBlobSafeMimeType(null)).toBe(FALLBACK_MIMETYPE);
    // @ts-expect-error
    expect(getBlobSafeMimeType(42)).toBe(FALLBACK_MIMETYPE);
  });
});

describe('mimeTypeToExt', () => {
  it.each([
    ['image/jpeg', 'jpeg'],
    ['image/png', 'png'],
    ['video/mp4', 'mp4'],
    ['audio/ogg', 'ogg'],
    ['application/pdf', 'pdf'],
    ['text/plain', 'plain'],
  ])('%s → %s', (mimeType, expected) => {
    expect(mimeTypeToExt(mimeType)).toBe(expected);
  });
});

describe('getFileNameExt', () => {
  it.each([
    ['photo.jpg', 'jpg'],
    ['archive.tar.gz', 'gz'],
    ['readme.MD', 'MD'],
    // No dot: lastIndexOf returns -1, slice(0) returns the full string
    ['noextension', 'noextension'],
  ])('%s → "%s"', (filename, expected) => {
    expect(getFileNameExt(filename)).toBe(expected);
  });
});

describe('getFileNameWithoutExt', () => {
  it.each([
    ['photo.jpg', 'photo'],
    ['archive.tar.gz', 'archive.tar'],
    ['noextension', 'noextension'],
    ['.gitignore', '.gitignore'],
    ['.hidden.txt', '.hidden'],
  ])('%s → "%s"', (filename, expected) => {
    expect(getFileNameWithoutExt(filename)).toBe(expected);
  });
});
