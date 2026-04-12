import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { PrefixedLogger } from './utils/console-style.js';

const CONFIG_PATH = 'config.json';
const OVERRIDES_ENV = 'CLIENT_CONFIG_OVERRIDES_JSON';
const STRICT_ENV = 'CLIENT_CONFIG_OVERRIDES_STRICT';
const logger = new PrefixedLogger('[config-inject]');

const formatError = (error) => {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
};

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Keys that could trigger prototype pollution via bracket assignment.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const deepMerge = (target, source) => {
  if (!isPlainObject(target) || !isPlainObject(source)) return source;

  const merged = { ...target };
  Object.entries(source).forEach(([key, value]) => {
    if (UNSAFE_KEYS.has(key)) return;
    const targetValue = merged[key];
    merged[key] =
      isPlainObject(targetValue) && isPlainObject(value) ? deepMerge(targetValue, value) : value;
  });
  return merged;
};

const failOnError = process.env[STRICT_ENV] === 'true';
const overridesRaw = process.env[OVERRIDES_ENV];

if (!overridesRaw) {
  logger.info(`No ${OVERRIDES_ENV} provided; leaving ${CONFIG_PATH} unchanged.`);
  process.exit(0);
}

let fileConfig;
let overrides;

try {
  const file = await readFile(CONFIG_PATH, 'utf8');
  fileConfig = JSON.parse(file);
} catch (error) {
  logger.error(`Failed reading ${CONFIG_PATH}: ${formatError(error)}`);
  process.exit(1);
}

try {
  overrides = JSON.parse(overridesRaw);
  if (!isPlainObject(overrides)) {
    throw new Error(`${OVERRIDES_ENV} must be a JSON object.`);
  }
} catch (error) {
  const message = `[config-inject] Invalid ${OVERRIDES_ENV}; ${
    failOnError ? 'failing build' : 'skipping overrides'
  }.`;
  if (failOnError) {
    logger.error(`${message} ${formatError(error)}`);
    process.exit(1);
  }
  logger.info(`[warning] ${message} ${formatError(error)}`);
  process.exit(0);
}

const mergedConfig = deepMerge(fileConfig, overrides);

await writeFile(CONFIG_PATH, `${JSON.stringify(mergedConfig, null, 2)}\n`, 'utf8');
logger.info(
  `Applied overrides to ${CONFIG_PATH}. Top-level keys: ${Object.keys(overrides).join(', ')}`
);
