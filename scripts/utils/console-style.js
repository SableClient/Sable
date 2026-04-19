/* oxlint-disable no-console */
import process from 'node:process';

export const ANSI = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  dim: '\x1b[2m',
};

export function shouldUseColor() {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0') return true;
  return Boolean(process.stdout.isTTY);
}

export function styleText(text, color, enabled) {
  if (!enabled) return text;
  return `${color}${text}${ANSI.reset}`;
}

export function createTextHelpers(options = {}) {
  const useColor = options.useColor ?? shouldUseColor();
  const style = (text, color) => styleText(text, color, useColor);
  const dim = (text) => styleText(text, ANSI.dim, useColor);
  const red = (text) => styleText(text, ANSI.red, useColor);
  const green = (text) => styleText(text, ANSI.green, useColor);
  return {
    useColor,
    style,
    dim,
    red,
    green,
  };
}

export class PrefixedLogger {
  constructor(prefix, options = {}) {
    this.prefix = prefix;
    this.useColor = options.useColor ?? shouldUseColor();
    this.prefixColor = options.prefixColor ?? ANSI.dim;
  }

  withPrefix(message) {
    return `${styleText(this.prefix, this.prefixColor, this.useColor)} ${message}`;
  }

  info(message) {
    console.log(this.withPrefix(message));
  }

  error(message) {
    console.error(this.withPrefix(message));
  }
}
