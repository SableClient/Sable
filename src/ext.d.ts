/// <reference types="vite/client" />

declare const SABLE_PRODUCT_NAME: string;
declare const SABLE_BUILD_FLAVOR: string;
declare const APP_VERSION: string;
declare const BUILD_HASH: string;
declare const IS_RELEASE_TAG: boolean;
declare const DESKTOP_UPDATER_ENABLED: boolean;

declare module 'browser-encrypt-attachment' {
  export interface EncryptedAttachmentInfo {
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
  }

  export interface EncryptedAttachment {
    data: ArrayBuffer;
    info: EncryptedAttachmentInfo;
  }

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
