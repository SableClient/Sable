import * as RustSdkCryptoJs from '@matrix-org/matrix-sdk-crypto-wasm';

const SCANNED_BYTES = Symbol('sable.scannedQrCodeBytes');

let patched = false;

type QrCodeScanClass = {
  prototype: object;
  fromBytes: (buffer: Uint8ClampedArray) => unknown;
};

// A wasm `QrCodeScan` handle cannot be read back, so keep the bytes on the object.
export const patchQrCodeScan = (): void => {
  if (patched) return;
  patched = true;

  const QrCodeScan = RustSdkCryptoJs.QrCodeScan as unknown as QrCodeScanClass;
  QrCodeScan.fromBytes = (buffer) => {
    const scan = Object.create(QrCodeScan.prototype) as object;
    Object.defineProperty(scan, SCANNED_BYTES, { value: Uint8Array.from(buffer) });
    Object.defineProperty(scan, 'free', { value: () => {} });
    return scan;
  };
};

export const scannedQrCodeBytes = (scan: unknown): Uint8Array | undefined => {
  if (scan === null || typeof scan !== 'object') return undefined;
  const bytes = (scan as Record<symbol, unknown>)[SCANNED_BYTES];
  return bytes instanceof Uint8Array ? bytes : undefined;
};
