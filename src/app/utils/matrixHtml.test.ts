import { describe, expect, it } from 'vitest';
import { normalizeMfmHexToMatrixColor } from './matrixHtml';

describe('normalizeMfmHexToMatrixColor', () => {
  it('expands 3-digit hex', () => {
    expect(normalizeMfmHexToMatrixColor('f00')).toBe('#ff0000');
    expect(normalizeMfmHexToMatrixColor('#f00')).toBe('#ff0000');
  });

  it('accepts 6-digit hex', () => {
    expect(normalizeMfmHexToMatrixColor('ff0000')).toBe('#ff0000');
    expect(normalizeMfmHexToMatrixColor('#00ff00')).toBe('#00ff00');
  });

  it('rejects invalid values', () => {
    expect(normalizeMfmHexToMatrixColor('red')).toBeUndefined();
    expect(normalizeMfmHexToMatrixColor('ffff')).toBeUndefined();
  });

  it('rejects 4- and 8-digit hex (alpha channels)', () => {
    expect(normalizeMfmHexToMatrixColor('ff00')).toBeUndefined();
    expect(normalizeMfmHexToMatrixColor('#ff00')).toBeUndefined();
    expect(normalizeMfmHexToMatrixColor('ff0000ff')).toBeUndefined();
    expect(normalizeMfmHexToMatrixColor('#ff0000ff')).toBeUndefined();
  });
});
