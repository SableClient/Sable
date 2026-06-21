type FormatCompactNumberOptions = {
  locales?: Intl.LocalesArgument;
  maximumFractionDigits?: number;
};

const DEFAULT_MAXIMUM_FRACTION_DIGITS = 1;
const FALLBACK_LOCALES: Intl.LocalesArgument = ['en'];

const isValidLocale = (locale: string): boolean => {
  try {
    Intl.NumberFormat(locale);
    return true;
  } catch {
    return false;
  }
};

const sanitizeLocales = (locales: Intl.LocalesArgument | undefined): Intl.LocalesArgument => {
  if (locales === undefined) return FALLBACK_LOCALES;

  const list = Array.isArray(locales) ? locales : [locales];
  const valid = list.filter(
    (locale): locale is string => typeof locale === 'string' && isValidLocale(locale)
  );

  return valid.length > 0 ? valid : FALLBACK_LOCALES;
};

const getDefaultLocales = (): Intl.LocalesArgument | undefined =>
  typeof navigator === 'undefined' ? undefined : sanitizeLocales(navigator.languages);

export function formatCompactNumber(
  value: number,
  {
    locales = getDefaultLocales(),
    maximumFractionDigits = DEFAULT_MAXIMUM_FRACTION_DIGITS,
  }: FormatCompactNumberOptions = {}
): string {
  return new Intl.NumberFormat(sanitizeLocales(locales), {
    notation: 'compact',
    maximumFractionDigits,
  }).format(value);
}
