import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import * as RustSdkCryptoJs from '@matrix-org/matrix-sdk-crypto-wasm';

/**
 * The crypto backend implements js-sdk's public `CryptoBackend`, but js-sdk still offers no
 * seam for supplying one, so `install.ts` assigns the private `cryptoBackend` field. These
 * assertions run against the installed js-sdk so a version bump that moves it fails here
 * rather than leaving the app running with no crypto at all.
 */
describe('matrix-js-sdk internals the crypto engine relies on', () => {
  it('MatrixClient still exposes crypto through the cryptoBackend field', () => {
    const require = createRequire(import.meta.url);
    const source = readFileSync(require.resolve('matrix-js-sdk/lib/client.js'), 'utf8');

    expect(source).toContain('this.cryptoBackend = ');
    expect(source).toMatch(/getCrypto\(\)\s*\{\s*return this\.cryptoBackend;/);
  });

  /**
   * Verification methods cross the IPC boundary as bare integers: the webview sends codes
   * from this wasm enum, and the engine's `method_from_code` maps them back with hardcoded
   * 0..3. The wasm package and the native matrix-sdk-crypto crate are versioned separately,
   * so if either reorders this enum the two sides desync silently and QR verification stops
   * negotiating. Keep these in step with `method_from_code` in matrix_crypto/verification.rs.
   */
  it('pins the method codes the engine decodes by number', () => {
    expect(RustSdkCryptoJs.VerificationMethod.SasV1).toBe(0);
    expect(RustSdkCryptoJs.VerificationMethod.QrCodeScanV1).toBe(1);
    expect(RustSdkCryptoJs.VerificationMethod.QrCodeShowV1).toBe(2);
    expect(RustSdkCryptoJs.VerificationMethod.ReciprocateV1).toBe(3);
  });
});
