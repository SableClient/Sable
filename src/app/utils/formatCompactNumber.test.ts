import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatCompactNumber } from './formatCompactNumber';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatCompactNumber', () => {
  it('uses navigator.languages by default', () => {
    const originalLanguages = navigator.languages;
    const format = vi.fn<(num: number) => string>().mockReturnValue('formatted');
    const numberFormat = vi
      .spyOn(Intl, 'NumberFormat')
      .mockImplementation(function MockNumberFormat() {
        return {
          format,
        } as unknown as Intl.NumberFormat;
      } as typeof Intl.NumberFormat);

    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      value: ['fr-FR'],
    });

    try {
      expect(formatCompactNumber(1_500)).toBe('formatted');
      expect(numberFormat).toHaveBeenCalledWith(['fr-FR'], {
        notation: 'compact',
        maximumFractionDigits: 1,
      });
      expect(format).toHaveBeenCalledWith(1_500);
    } finally {
      Object.defineProperty(navigator, 'languages', {
        configurable: true,
        value: originalLanguages,
      });
    }
  });

  it('passes explicit locales and options to Intl.NumberFormat', () => {
    const format = vi.fn<(num: number) => string>().mockReturnValue('formatted');
    const numberFormat = vi
      .spyOn(Intl, 'NumberFormat')
      .mockImplementation(function MockNumberFormat() {
        return {
          format,
        } as unknown as Intl.NumberFormat;
      } as typeof Intl.NumberFormat);

    expect(
      formatCompactNumber(1_250_000, {
        locales: ['fr-FR'],
        maximumFractionDigits: 2,
      })
    ).toBe('formatted');
    expect(numberFormat).toHaveBeenCalledWith(['fr-FR'], {
      notation: 'compact',
      maximumFractionDigits: 2,
    });
    expect(format).toHaveBeenCalledWith(1_250_000);
  });

  it('uses Intl compact notation for formatted output', () => {
    const expected = new Intl.NumberFormat(['fr-FR'], {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(1_250_000);

    expect(formatCompactNumber(1_250_000, { locales: ['fr-FR'] })).toBe(expected);
  });
});
