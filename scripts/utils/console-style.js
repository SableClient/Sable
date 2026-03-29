/* eslint-disable no-console */
import process from 'node:process';

/**
 * @typedef {object} TextHelperOptions
 * @property {boolean} [useColor]
 */

/**
 * @typedef {TextHelperOptions & {
 *   prefixColor?: string;
 * }} LoggerOptions
 */

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

/**
 * @param {string} text
 * @param {string} color
 * @param {boolean} enabled
 * @returns {string}
 */
export function styleText(text, color, enabled) {
  if (!enabled) return text;
  return `${color}${text}${ANSI.reset}`;
}

/**
 * @param {TextHelperOptions} [options]
 */
export function createTextHelpers(options = {}) {
  const useColor = options.useColor ?? shouldUseColor();
  /**
   * @param {string} text
   * @param {string} color
   * @returns {string}
   */
  const style = (text, color) => styleText(text, color, useColor);
  /** @param {string} text */
  const dim = (text) => styleText(text, ANSI.dim, useColor);
  /** @param {string} text */
  const red = (text) => styleText(text, ANSI.red, useColor);
  /** @param {string} text */
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
  /**
   * @param {string} prefix
   * @param {LoggerOptions} [options]
   */
  constructor(prefix, options = {}) {
    this.prefix = prefix;
    this.useColor = options.useColor ?? shouldUseColor();
    this.prefixColor = options.prefixColor ?? ANSI.dim;
  }

  /**
   * @param {string} message
   * @returns {string}
   */
  withPrefix(message) {
    return `${styleText(this.prefix, this.prefixColor, this.useColor)} ${message}`;
  }

  /** @param {string} message */
  info(message) {
    console.log(this.withPrefix(message));
  }

  /** @param {string} message */
  error(message) {
    console.error(this.withPrefix(message));
  }
}
