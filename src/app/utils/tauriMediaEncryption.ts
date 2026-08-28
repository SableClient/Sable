import { isTauri, invoke } from '@tauri-apps/api/core';
import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';

export const setMediaEncryption = async (
  url: string,
  encInfo: EncryptedAttachmentInfo,
  mimeType: string
): Promise<boolean> => {
  if (!isTauri()) return false;

  const jwkKey = encInfo.key as JsonWebKey;
  if (!jwkKey.k) return false;

  await invoke('set_media_encryption', {
    url,
    key: jwkKey.k,
    iv: encInfo.iv,
    sha256: encInfo.hashes.sha256,
    version: encInfo.v ?? '',
    mimeType,
  });
  return true;
};
