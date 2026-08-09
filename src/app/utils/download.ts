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

const sanitizeDownloadFilename = (filename: string, fallback = 'download'): string => {
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
  if (!response.ok) {
    throw new Error(`Failed to fetch media: ${response.status} ${response.statusText}`);
  }
  return response.blob();
}

export async function saveMediaToGallery(
  input: Blob | string,
  filename: string,
  mimeType: string
): Promise<void> {
  const mediaMimeType = mimeType.trim().toLowerCase();
  if (!mediaMimeType.startsWith('image/')) {
    throw new Error(`Only image media can be saved to the gallery (received "${mimeType}")`);
  }
  if (!isTauri()) {
    throw new Error('Saving to the gallery is only available in the Android and iOS apps');
  }

  const platform = osType();
  if (platform !== 'android' && platform !== 'ios') {
    throw new Error(`Saving to the gallery is not supported on ${platform}`);
  }

  if (platform === 'android') {
    const { AndroidFs, AndroidPublicImageDir } = await import('tauri-plugin-android-fs-api');
    let uri: Awaited<ReturnType<typeof AndroidFs.createNewPublicImageFile>> | undefined;
    try {
      const blob = await resolveBlob(input);
      const bytes = new Uint8Array(await blob.arrayBuffer());

      if (!(await AndroidFs.checkPublicFilesPermission())) {
        const granted = await AndroidFs.requestPublicFilesPermission();
        if (!granted) throw new Error('Storage permission was denied');
      }

      uri = await AndroidFs.createNewPublicImageFile(
        AndroidPublicImageDir.Pictures,
        filename,
        mediaMimeType,
        { isPending: true, requestPermission: true }
      );
      await AndroidFs.writeFile(uri, bytes);
      await AndroidFs.setPublicFilePending(uri, false);
      await AndroidFs.scanPublicFile(uri);
      showToast('Saved to Gallery');
    } catch (error) {
      if (uri) await AndroidFs.removeFile(uri).catch(() => undefined);
      const message = error instanceof Error ? error.message : 'unknown error';
      showToast(`Failed to save to gallery: ${message}`);
    }
    return;
  }

  try {
    const blob = await resolveBlob(input);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    await invoke('save_media_to_photos', {
      filename,
      mimeType: mediaMimeType,
      bytes: Array.from(bytes),
    });
    showToast('Saved to Photos');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    showToast(`Failed to save to photos: ${message}`);
  }
}

export async function saveFileToDevice(
  input: Blob | string,
  filename: string,
  mimeType?: string
): Promise<'saved' | 'cancelled' | 'failed'> {
  if (isTauri()) {
    try {
      const blob = await resolveBlob(input);
      const bytes = new Uint8Array(await blob.arrayBuffer());

      if (osType() === 'android') {
        const { AndroidFs, AndroidPublicGeneralPurposeDir } =
          await import('tauri-plugin-android-fs-api');
        let uri: Awaited<ReturnType<typeof AndroidFs.createNewPublicFile>> | undefined;
        try {
          if (!(await AndroidFs.checkPublicFilesPermission())) {
            const granted = await AndroidFs.requestPublicFilesPermission();
            if (!granted) throw new Error('Storage permission was denied');
          }

          uri = await AndroidFs.createNewPublicFile(
            AndroidPublicGeneralPurposeDir.Download,
            filename,
            mimeType || blob.type || null,
            { isPending: true, requestPermission: true }
          );
          await AndroidFs.writeFile(uri, bytes);
          await AndroidFs.setPublicFilePending(uri, false);
          await AndroidFs.scanPublicFile(uri);
          showToast('Saved to Downloads');
          return 'saved';
        } catch (error) {
          if (uri) await AndroidFs.removeFile(uri).catch(() => undefined);
          throw error;
        }
      }

      if (osType() === 'ios') {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const path = await save({ defaultPath: filename });
        if (!path) return 'cancelled';

        const { writeFile } = await import('@tauri-apps/plugin-fs');
        await writeFile(path, bytes);
        showToast('File saved');
        return 'saved';
      }

      const saved = await invoke<boolean>('save_download', { filename, bytes: Array.from(bytes) });
      if (saved) showToast('File saved');
      return saved ? 'saved' : 'cancelled';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      showToast(`Failed to save file: ${message}`);
      return 'failed';
    }
  }

  FileSaver.saveAs(input, filename);
  return 'saved';
}

export const downloadJsonFile = (
  content: string,
  fileNamePrefix: string
): Promise<'saved' | 'cancelled' | 'failed'> =>
  saveFileToDevice(
    new Blob([content], { type: 'application/json' }),
    `${fileNamePrefix}-${Date.now()}.json`,
    'application/json'
  );
