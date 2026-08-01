import { describe, expect, it } from 'vitest';
import { isServerUrlPreviewEnabled } from './urlPreview';

describe('isServerUrlPreviewEnabled', () => {
  it.each([
    [false, false, false, false],
    [false, true, false, true],
    [true, false, false, false],
    [true, true, false, false],
    [true, false, true, true],
  ])(
    'uses the setting for the room encryption state',
    (isEncrypted, urlPreview, encUrlPreview, expected) => {
      expect(isServerUrlPreviewEnabled(isEncrypted, urlPreview, encUrlPreview)).toBe(expected);
    }
  );
});
