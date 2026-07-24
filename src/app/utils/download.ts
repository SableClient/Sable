import FileSaver from 'file-saver';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';
import { fetch } from '$utils/fetch';
import { showToast } from '$state/toast';

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g;
const CONTROL_CHARS = /\p{Cc}/gu;
const BIDI_CONTROL_CHARS = /[\u202a-\u202e\u2066-\u2069]/g;
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const MAX_FILENAME_LENGTH = 255;

const nonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const getAttachmentFilename = (
  filename: unknown,
  body: unknown,
  fallback = 'download'
): string => nonEmptyString(filename) ?? nonEmptyString(body) ?? fallback;

export const sanitizeDownloadFilename = (filename: string, fallback = 'download'): string => {
  let safeName = filename
    .replace(INVALID_FILENAME_CHARS, '_')
    .replace(CONTROL_CHARS, '_')
    .replace(BIDI_CONTROL_CHARS, '')
    .trim()
    .replace(/[. ]+$/g, '');

  if (!safeName || safeName === '.' || safeName === '..') safeName = fallback;
  if (WINDOWS_RESERVED_NAME.test(safeName)) safeName = `_${safeName}`;

  if (safeName.length > MAX_FILENAME_LENGTH) {
    const extensionStart = safeName.lastIndexOf('.');
    const extension = extensionStart > 0 ? safeName.slice(extensionStart) : '';
    const extensionLength = Math.min(extension.length, 32);
    safeName = `${safeName.slice(0, MAX_FILENAME_LENGTH - extensionLength)}${extension.slice(
      -extensionLength
    )}`;
  }

  return safeName;
};

export const getDownloadFilename = (
  filename: unknown,
  body?: unknown,
  fallback = 'download'
): string => sanitizeDownloadFilename(getAttachmentFilename(filename, body, fallback), fallback);

async function resolveBlob(input: Blob | string): Promise<Blob> {
  if (typeof input !== 'string') return input;
  const response = await fetch(input);
  return response.blob();
}

export async function saveFileToDevice(
  input: Blob | string,
  filename: string,
  mimeType?: string
): Promise<void> {
  if (isTauri()) {
    const blob = await resolveBlob(input);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    if (osType() === 'android') {
      const { AndroidFs, AndroidPublicGeneralPurposeDir } =
        await import('tauri-plugin-android-fs-api');
      const uri = await AndroidFs.createNewPublicFile(
        AndroidPublicGeneralPurposeDir.Download,
        filename,
        mimeType || blob.type || null,
        { isPending: true }
      );
      await AndroidFs.writeFile(uri, bytes);
      await AndroidFs.setPublicFilePending(uri, false);
      showToast('Saved to Downloads');
      return;
    }

    const saved = await invoke<boolean>('save_download', { filename, bytes: Array.from(bytes) });
    if (saved) showToast('File saved');
    return;
  }

  FileSaver.saveAs(input, filename);
}
