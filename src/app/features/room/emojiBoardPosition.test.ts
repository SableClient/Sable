import { describe, expect, it } from 'vitest';
import { getEmojiBoardRightOffset, getEmojiBoardWidth } from './emojiBoardPosition';

describe('emojiBoardPosition', () => {
  it('uses the responsive mobile width when the viewport is narrow', () => {
    expect(getEmojiBoardWidth(390)).toBe(358);
  });

  it('centers the picker inside the fixed mobile gutter', () => {
    expect(getEmojiBoardRightOffset(342, 390)).toBe(16);
    expect(getEmojiBoardRightOffset(250, 390)).toBe(16);
  });

  it('keeps the desktop picker anchored to its trigger when full width is available', () => {
    expect(getEmojiBoardRightOffset(1392, 1440)).toBe(48);
  });

  it('clamps desktop alignment before the picker would overflow the viewport', () => {
    expect(getEmojiBoardRightOffset(-24, 640)).toBe(208);
  });
});
