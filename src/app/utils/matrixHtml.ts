export const MATRIX_HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export function isMatrixHexColor(value: string): boolean {
  return MATRIX_HEX_COLOR_REGEX.test(value);
}
