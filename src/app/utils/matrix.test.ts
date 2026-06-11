import { describe, expect, it } from 'vitest';
import { decryptFile, encryptFile } from './matrix';

describe('encrypted media helpers', () => {
  it('accepts padded SHA-256 hashes for encrypted attachments', async () => {
    const original = new Blob(['hello encrypted media'], { type: 'text/plain' });
    const encrypted = await encryptFile(original);
    const encryptedBytes = await encrypted.file.arrayBuffer();

    const paddedInfo = {
      ...encrypted.encInfo,
      hashes: {
        ...encrypted.encInfo.hashes,
        sha256: `${encrypted.encInfo.hashes.sha256}=`,
      },
    };

    const decrypted = await decryptFile(encryptedBytes, original.type, paddedInfo);

    await expect(decrypted.text()).resolves.toBe('hello encrypted media');
  });
});
