import FileSaver from 'file-saver';
import * as Sentry from '@sentry/react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';
import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { showErrorToast, showToast } from '$state/toast';
import { fetchMediaBlob } from '$utils/mediaTransport';
import { setMediaEncryption } from '$utils/tauriMediaEncryption';

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g;
const CONTROL_CHARS = /\p{Cc}/gu;
const BIDI_CONTROL_CHARS = /[\u202a-\u202e\u2066-\u2069]/g;
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const MAX_FILENAME_LENGTH = 255;

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

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

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/apng': '.png',
  'image/svg+xml': '.svg',
};

const HAS_EXTENSION = /\.[a-z0-9]{1,10}$/i;

export const getDownloadFilename = (
  filename: unknown,
  body?: unknown,
  fallback = 'download',
  mimeType?: string
): string => {
  let name = sanitizeDownloadFilename(getAttachmentFilename(filename, body, fallback), fallback);
  if (mimeType) {
    const extension = MIME_EXTENSIONS[mimeType.trim().toLowerCase()];
    if (extension && !HAS_EXTENSION.test(name)) name += extension;
  }
  return name;
};

const splitExtension = (filename: string): [stem: string, extension: string] => {
  const at = filename.lastIndexOf('.');
  return at > 0 ? [filename.slice(0, at), filename.slice(at)] : [filename, ''];
};

// MediaStore gives up after 32 numbered variants, and resolves the final name
// when the pending flag clears rather than on create, so retry the whole save.
const saveWithUniqueName = async (
  filename: string,
  save: (filename: string) => Promise<void>
): Promise<void> => {
  try {
    await save(filename);
  } catch {
    const [stem, extension] = splitExtension(filename);
    await save(sanitizeDownloadFilename(`${stem}-${Date.now()}${extension}`));
  }
};

// Name first: names contain spaces, so `\S*` would leave the rest behind.
const scrubError = (error: unknown, filename: string): string =>
  getErrorMessage(error)
    .split(splitExtension(filename)[0])
    .join('[FILENAME]')
    .replace(/\/(?:storage|data|var|Users|home)\/\S*/g, '[PATH]')
    .replace(/\b(_display_name|_data|title|relative_path)=\S*/g, '$1=[REDACTED]');

const platformTag = (): string => (isTauri() ? osType() : 'web');

const reportSaveFailure = (
  error: unknown,
  target: 'downloads' | 'gallery' | 'photos',
  filename: string,
  mimeType?: string
): void => {
  Sentry.captureException(new Error(scrubError(error, filename)), {
    tags: { feature: 'media-save', target, platform: platformTag() },
    extra: { mimeType },
  });
};

export const reportDownloadFailure = (
  error: unknown,
  stage: 'fetch' | 'save',
  filename: string,
  mimeType?: string
): void => {
  Sentry.captureException(new Error(scrubError(error, filename)), {
    tags: { feature: 'media-download', stage, platform: platformTag() },
    extra: { mimeType },
  });
};

async function resolveBlob(input: Blob | string): Promise<Blob> {
  if (typeof input !== 'string') return input;
  return fetchMediaBlob(input);
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
    const AndroidFs = await import('tauri-plugin-android-fs-api');
    try {
      const blob = await resolveBlob(input);
      const bytes = new Uint8Array(await blob.arrayBuffer());

      if (!(await AndroidFs.checkPublicFilesPermission())) {
        const granted = await AndroidFs.requestPublicFilesPermission();
        if (!granted) throw new Error('Storage permission was denied');
      }

      await saveWithUniqueName(filename, async (name) => {
        const uri = await AndroidFs.createNewPublicImageFile(
          AndroidFs.PublicImageDir.Pictures,
          name,
          mediaMimeType,
          { isPending: true, requestPermission: true }
        );
        try {
          await AndroidFs.writeFile(uri, bytes);
          await AndroidFs.setPublicFilePending(uri, false);
          await AndroidFs.scanPublicFile(uri);
        } catch (error) {
          await AndroidFs.removeFile(uri).catch(() => undefined);
          throw error;
        }
      });
      showToast('Saved to Gallery');
    } catch (error) {
      reportSaveFailure(error, 'gallery', filename, mediaMimeType);
      showErrorToast(`Failed to save to gallery: ${getErrorMessage(error)}`);
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
    reportSaveFailure(error, 'photos', filename, mediaMimeType);
    showErrorToast(`Failed to save to photos: ${getErrorMessage(error)}`);
  }
}

export async function saveFileToDevice(
  input: Blob | string,
  filename: string,
  mimeType?: string
): Promise<'saved' | 'cancelled' | 'failed'> {
  let blob: Blob;
  try {
    blob = await resolveBlob(input);
  } catch (error) {
    reportDownloadFailure(error, 'fetch', filename, mimeType);
    showErrorToast(`Failed to save file: ${getErrorMessage(error)}`);
    return 'failed';
  }

  if (isTauri()) {
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());

      if (osType() === 'android') {
        const AndroidFs = await import('tauri-plugin-android-fs-api');
        if (!(await AndroidFs.checkPublicFilesPermission())) {
          const granted = await AndroidFs.requestPublicFilesPermission();
          if (!granted) throw new Error('Storage permission was denied');
        }

        await saveWithUniqueName(filename, async (name) => {
          const uri = await AndroidFs.createNewPublicFile(
            AndroidFs.PublicGeneralPurposeDir.Download,
            name,
            mimeType || blob.type || null,
            { isPending: true, requestPermission: true }
          );
          try {
            await AndroidFs.writeFile(uri, bytes);
            await AndroidFs.setPublicFilePending(uri, false);
            await AndroidFs.scanPublicFile(uri);
          } catch (error) {
            await AndroidFs.removeFile(uri).catch(() => undefined);
            throw error;
          }
        });
        showToast('Saved to Downloads');
        return 'saved';
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
      reportSaveFailure(error, 'downloads', filename, mimeType || blob.type || undefined);
      showErrorToast(`Failed to save file: ${getErrorMessage(error)}`);
      return 'failed';
    }
  }

  try {
    FileSaver.saveAs(blob, filename);
  } catch (error) {
    reportDownloadFailure(error, 'save', filename, mimeType || blob.type || undefined);
    showErrorToast(`Failed to save file: ${getErrorMessage(error)}`);
    return 'failed';
  }
  return 'saved';
}

const isDesktopTauri = (): boolean => isTauri() && osType() !== 'android' && osType() !== 'ios';

export type SaveMediaOptions = {
  mediaUrl: string;
  filename: string;
  mimeType?: string;
  encInfo?: EncryptedAttachmentInfo;
  loadBlob: () => Promise<Blob>;
};

export async function saveMediaToDevice({
  mediaUrl,
  filename,
  mimeType,
  encInfo,
  loadBlob,
}: SaveMediaOptions): Promise<'saved' | 'cancelled' | 'failed'> {
  const saveFetchedBlob = async (): Promise<'saved' | 'cancelled' | 'failed'> => {
    let blob: Blob;
    try {
      blob = await loadBlob();
    } catch (error) {
      reportDownloadFailure(error, 'fetch', filename, mimeType);
      showErrorToast(`Failed to save file: ${getErrorMessage(error)}`);
      return 'failed';
    }
    return saveFileToDevice(blob, filename, mimeType);
  };

  if (!isDesktopTauri()) return saveFetchedBlob();

  try {
    // Without keys the native handler would write ciphertext.
    if (encInfo && !(await setMediaEncryption(mediaUrl, encInfo, mimeType ?? ''))) {
      return saveFetchedBlob();
    }

    const saved = await invoke<boolean>('save_media_download', { url: mediaUrl, filename });
    if (saved) showToast('File saved');
    return saved ? 'saved' : 'cancelled';
  } catch (error) {
    reportDownloadFailure(error, 'save', filename, mimeType);
    return saveFetchedBlob();
  }
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
