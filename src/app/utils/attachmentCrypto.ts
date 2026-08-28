import { sha256 } from '@noble/hashes/sha2.js';
import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';

const CHUNK_SIZE = 4 * 1024 * 1024;

const encodeUnpaddedBase64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/=+$/, '');

const counterForBlock = (nonce: Uint8Array, blockIndex: number): Uint8Array<ArrayBuffer> => {
  const counter = new Uint8Array(16);
  counter.set(nonce, 0);
  const view = new DataView(counter.buffer);
  view.setUint32(8, Math.floor(blockIndex / 2 ** 32));
  view.setUint32(12, blockIndex >>> 0);
  return counter;
};

export const encryptAttachmentStreaming = async (
  file: Blob
): Promise<{ blob: Blob; info: EncryptedAttachmentInfo }> => {
  const key = await crypto.subtle.generateKey({ name: 'AES-CTR', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const exportedKey = (await crypto.subtle.exportKey('jwk', key)) as EncryptedAttachmentInfo['key'];

  const iv = new Uint8Array(16);
  crypto.getRandomValues(iv.subarray(0, 8));
  const nonce = iv.subarray(0, 8);

  const hasher = sha256.create();
  const parts: BlobPart[] = [];

  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    // eslint-disable-next-line no-await-in-loop -- stream chunks to cap peak memory
    const plainChunk = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
    const counter = counterForBlock(nonce, offset / 16);
    // eslint-disable-next-line no-await-in-loop -- stream chunks to cap peak memory
    const cipherChunk = await crypto.subtle.encrypt(
      { name: 'AES-CTR', counter, length: 64 },
      key,
      plainChunk
    );
    const bytes = new Uint8Array(cipherChunk);
    hasher.update(bytes);
    parts.push(new Blob([bytes]));
  }

  const info: EncryptedAttachmentInfo = {
    v: 'v2',
    key: exportedKey,
    iv: encodeUnpaddedBase64(iv),
    hashes: { sha256: encodeUnpaddedBase64(hasher.digest()) },
  };

  return { blob: new Blob(parts, { type: file.type }), info };
};
