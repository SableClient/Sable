type FormatCompactNumberOptions = {
  locales?: Intl.LocalesArgument;
  maximumFractionDigits?: number;
};

const DEFAULT_MAXIMUM_FRACTION_DIGITS = 1;

const getDefaultLocales = (): Intl.LocalesArgument | undefined =>
  typeof navigator === 'undefined' ? undefined : navigator.languages;

export function formatCompactNumber(
  value: number,
  {
    locales = getDefaultLocales(),
    maximumFractionDigits = DEFAULT_MAXIMUM_FRACTION_DIGITS,
  }: FormatCompactNumberOptions = {}
): string {
  return new Intl.NumberFormat(locales, {
    notation: 'compact',
    maximumFractionDigits,
  }).format(value);
}
