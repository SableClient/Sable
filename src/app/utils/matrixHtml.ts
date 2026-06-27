export const MATRIX_HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export function isMatrixHexColor(value: string): boolean {
  return MATRIX_HEX_COLOR_REGEX.test(value);
}

/** MFM / composer input: optional `#` then exactly 3 or 6 hex digits (no alpha). */
export const MFM_HEX_INPUT_REGEX = /^#?(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

/** One `fg.color=` / `bg.color=` value in a `$[…]` block (no alpha). */
export const MFM_HEX_COLOR_VALUE_PATTERN = '[#]?(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])';

/**
 * Normalizes MFM-style hex (3 or 6 digits, optional `#`) to Matrix `#RRGGBB`.
 */
export function normalizeMfmHexToMatrixColor(hex: string): string | undefined {
  const trimmed = hex.trim();
  if (!MFM_HEX_INPUT_REGEX.test(trimmed)) return undefined;

  const digits = trimmed.replace(/^#/, '').toLowerCase();
  if (digits.length === 3) {
    const expanded = `${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`;
    const color = `#${expanded}`;
    return isMatrixHexColor(color) ? color : undefined;
  }

  const color = `#${digits}`;
  return isMatrixHexColor(color) ? color : undefined;
}

/** Strips `#` for MFM `fg.color=` / `bg.color=` round-trip. */
export function matrixColorToMfmHex(value: string): string | undefined {
  if (!isMatrixHexColor(value)) return undefined;
  return value.slice(1).toLowerCase();
}
