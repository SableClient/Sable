/**
 * https://www.npmjs.com/package/escape-string-regexp
 */
export const sanitizeForRegex = (unsafeText: string): string =>
  unsafeText.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d');

export const HTTP_URL_PATTERN = `https?:\\/\\/(?:www\\.)?(?:[^\\s)]*)(?<![.,:;!/?()[\\]\\s]+)`;

export const URL_REG = new RegExp(HTTP_URL_PATTERN, 'g');

export const EMAIL_REGEX =
  /^(([^<>()[\]\\.,;:\s@\\"]+(\.[^<>()[\]\\.,;:\s@\\"]+)*)|(\\".+\\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
