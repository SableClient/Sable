import { createLogger } from '$utils/debug';
import { FALLBACK_MIMETYPE, TGS_MIMETYPE } from '$utils/mimeTypes';
import { isAndroidTauri } from '$utils/platform';

const log = createLogger('nativeFilePicker');

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  aac: 'audio/aac',
  apng: 'image/apng',
  avif: 'image/avif',
  bmp: 'image/bmp',
  flac: 'audio/flac',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  json: 'application/json',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  m4a: 'audio/mp4',
  md: 'text/markdown',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  ogv: 'video/ogg',
  opus: 'audio/opus',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  tgs: TGS_MIMETYPE,
  txt: 'text/plain',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
};

const MEDIA_MIME_TYPES = ['image/*', 'video/*'];

export type NativePickerMode = 'media' | 'document';
export type NativeFileFailureHandler = (source: string, error: unknown) => void;

const normalizeSelectedPaths = (selected: unknown): string[] => {
  if (selected === null || selected === undefined) return [];

  const values = Array.isArray(selected) ? (selected as unknown[]) : [selected];
  const paths = values.filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  );
  if (paths.length !== values.length) {
    throw new Error(`Native picker returned unusable entries: ${JSON.stringify(selected)}`);
  }

  return paths;
};

const getFileName = (path: string, index: number): string => {
  const pathName = path.split(/[\\/]/).pop();
  if (!pathName) return `attachment-${index + 1}`;

  try {
    return decodeURIComponent(pathName);
  } catch {
    return pathName;
  }
};

const getMimeTypeFromName = (fileName: string): string => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension ? (MIME_TYPES_BY_EXTENSION[extension] ?? FALLBACK_MIMETYPE) : FALLBACK_MIMETYPE;
};

const resolveMimeType = (fileName: string, reportedMimeType?: string): string =>
  reportedMimeType && reportedMimeType !== FALLBACK_MIMETYPE
    ? reportedMimeType
    : getMimeTypeFromName(fileName);

const isFile = (file: File | undefined): file is File => file !== undefined;

const pickAndroidFiles = async (
  pickerMode: NativePickerMode,
  onFileFailure?: NativeFileFailureHandler
): Promise<File[]> => {
  const AndroidFs = await import('tauri-plugin-android-fs-api');
  const uris = await AndroidFs.showOpenFilePicker({
    pickerType: pickerMode === 'media' ? 'Gallery' : 'FilePicker',
    mimeTypes: pickerMode === 'media' ? MEDIA_MIME_TYPES : [],
    multiple: true,
  });
  const seenUris = new Set<string>();
  const uniqueUris = uris.filter(({ uri }) => {
    if (seenUris.has(uri)) return false;
    seenUris.add(uri);
    return true;
  });

  const files = await Promise.all(
    uniqueUris.map(async (uri, index): Promise<File | undefined> => {
      try {
        const metadata = await AndroidFs.getMetadata(uri);
        if (metadata.type !== 'File') return undefined;

        const name = metadata.name || `attachment-${index + 1}`;
        const contents = await AndroidFs.readFile(uri);
        return new File([contents], name, {
          type: resolveMimeType(name, metadata.mimeType),
          lastModified: metadata.lastModified.getTime(),
        });
      } catch (error) {
        onFileFailure?.(uri.uri, error);
        return undefined;
      }
    })
  );

  return files.filter(isFile);
};

const pickIosFiles = async (
  pickerMode: NativePickerMode,
  onFileFailure?: NativeFileFailureHandler
): Promise<File[]> => {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({ pickerMode, multiple: true });
  log.log('picker returned', pickerMode, typeof selected, selected);

  const paths = normalizeSelectedPaths(selected);
  if (paths.length === 0) {
    log.warn('picker resolved without any path (cancelled, or a swallowed native failure)');
    return [];
  }

  const { readFile, remove } = await import('@tauri-apps/plugin-fs');
  const files = await Promise.all(
    paths.map(async (path, index): Promise<File | undefined> => {
      const name = getFileName(path, index);
      try {
        const contents = await readFile(path);
        return new File([contents], name, { type: getMimeTypeFromName(name) });
      } catch (error) {
        onFileFailure?.(path, error);
        return undefined;
      } finally {
        await remove(path).catch((error: unknown) => onFileFailure?.(path, error));
      }
    })
  );

  return files.filter(isFile);
};

export const pickNativeFile = async (
  pickerMode: NativePickerMode,
  onFileFailure?: NativeFileFailureHandler
): Promise<File[]> =>
  isAndroidTauri()
    ? pickAndroidFiles(pickerMode, onFileFailure)
    : pickIosFiles(pickerMode, onFileFailure);
