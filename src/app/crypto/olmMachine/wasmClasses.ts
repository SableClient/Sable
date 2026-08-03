import * as RustSdkCryptoJs from '@matrix-org/matrix-sdk-crypto-wasm';
import { hydrate, type HydrationContext } from './hydrate';

// Every payload carries a `className` because js-sdk dispatches on `instanceof`.
type WasmClassName = keyof typeof RustSdkCryptoJs;

const hasOwnPrototype = (name: string): boolean => {
  const candidate = (RustSdkCryptoJs as Record<string, unknown>)[name];
  return typeof candidate === 'function' && 'prototype' in candidate;
};

export const graftWasmPrototypes = <T>(value: T, ctx: HydrationContext): T => {
  if (Array.isArray(value)) {
    value.forEach((item) => graftWasmPrototypes(item, ctx));
    return value;
  }
  if (value === null || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  for (const nested of Object.values(record)) {
    if (nested !== null && typeof nested === 'object') graftWasmPrototypes(nested, ctx);
  }

  const className = record.className;
  if (typeof className === 'string') {
    if (!hasOwnPrototype(className)) {
      throw new Error(
        `Rust crypto engine returned unknown wasm className "${className}"; ` +
          'the engine and matrix-sdk-crypto-wasm are out of sync'
      );
    }
    const wasmClass = (RustSdkCryptoJs as Record<string, unknown>)[className] as {
      prototype: object;
    };
    Object.setPrototypeOf(value, wasmClass.prototype);
    hydrate(className, record, ctx);
  }
  return value;
};

export const wasmClass = (name: WasmClassName): unknown =>
  (RustSdkCryptoJs as Record<string, unknown>)[name as string];

export { RustSdkCryptoJs };
