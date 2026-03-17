/// <reference types="vite/client" />

declare const APP_VERSION: string;
declare const BUILD_HASH: string;
declare const IS_RELEASE_TAG: boolean;

declare module 'browser-encrypt-attachment' {
  export type EncryptedAttachmentInfo = {
    v: string;
    key: {
      alg: string;
      key_ops: string[];
      kty: string;
      k: string;
      ext: boolean;
    };
    iv: string;
    hashes: Record<string, string>;
  };

  export type EncryptedAttachment = {
    data: ArrayBuffer;
    info: EncryptedAttachmentInfo;
  };

  export function encryptAttachment(dataBuffer: ArrayBuffer): Promise<EncryptedAttachment>;

  export function decryptAttachment(
    dataBuffer: ArrayBuffer,
    info: EncryptedAttachmentInfo
  ): Promise<ArrayBuffer>;
}

declare module '*.svg' {
  const content: string;
  export default content;
}
