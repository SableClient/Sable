// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { decryptAttachment } from 'browser-encrypt-attachment';
import { encryptAttachmentStreaming } from './attachmentCrypto';

beforeAll(() => {
  (globalThis as unknown as { window: unknown }).window = {
    crypto: globalThis.crypto,
    atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'),
  };
});

const roundTrip = async (size: number) => {
  const original = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) original[i] = (i * 131 + 7) & 0xff;
  const { blob, info } = await encryptAttachmentStreaming(new Blob([original]));
  const cipher = await blob.arrayBuffer();
  const decrypted = new Uint8Array(await decryptAttachment(cipher, info));
  return { original, decrypted, info, cipherLength: cipher.byteLength };
};

describe('encryptAttachmentStreaming', () => {
  it('is byte-compatible with browser-encrypt-attachment across chunk boundaries', async () => {
    const size = 4 * 1024 * 1024 * 2 + 12_345; // >2 chunks, non-block-aligned tail
    const { original, decrypted, info, cipherLength } = await roundTrip(size);
    expect(info.v).toBe('v2');
    expect(cipherLength).toBe(size);
    expect(decrypted.length).toBe(size);
    expect(Buffer.compare(Buffer.from(decrypted), Buffer.from(original))).toBe(0);
  });

  it('round-trips a small single-chunk file', async () => {
    const { original, decrypted } = await roundTrip(137);
    expect(Buffer.compare(Buffer.from(decrypted), Buffer.from(original))).toBe(0);
  });

  it('handles an exact chunk-size boundary', async () => {
    const { original, decrypted } = await roundTrip(4 * 1024 * 1024);
    expect(Buffer.compare(Buffer.from(decrypted), Buffer.from(original))).toBe(0);
  });
});
