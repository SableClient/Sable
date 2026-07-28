import { FALLBACK_MIMETYPE, TGS_MIMETYPE } from '$utils/mimeTypes';

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  apng: 'image/apng',
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  json: 'application/json',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  md: 'text/markdown',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  ogg: 'video/ogg',
  ogv: 'video/ogg',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  tgs: TGS_MIMETYPE,
  txt: 'text/plain',
  webm: 'video/webm',
  webp: 'image/webp',
};

export type NativePickerMode = 'media' | 'document';
export type NativeFileReadFailureHandler = (path: string, error: unknown) => void;

const normalizeSelectedPaths = (selected: string | string[] | null | undefined): string[] =>
  (typeof selected === 'string' ? [selected] : (selected ?? [])).filter((path) => path.length > 0);

const getFileName = (path: string, index: number): string => {
  const pathName = path.split(/[\\/]/).pop();
  if (!pathName) return `attachment-${index + 1}`;

  try {
    return decodeURIComponent(pathName);
  } catch {
    return pathName;
  }
};

const getMimeType = (fileName: string): string => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension ? (MIME_TYPES_BY_EXTENSION[extension] ?? FALLBACK_MIMETYPE) : FALLBACK_MIMETYPE;
};

export const pickNativeFile = async (
  pickerMode: NativePickerMode,
  onReadFailure?: NativeFileReadFailureHandler
): Promise<File[]> => {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({ pickerMode, multiple: true });
  const paths = normalizeSelectedPaths(selected);
  if (paths.length === 0) return [];

  const { readFile } = await import('@tauri-apps/plugin-fs');
  const files = await Promise.all(
    paths.map(async (path, index): Promise<File | undefined> => {
      try {
        const name = getFileName(path, index);
        const contents = await readFile(path);
        return new File([contents], name, { type: getMimeType(name) });
      } catch (error) {
        onReadFailure?.(path, error);
        return undefined;
      }
    })
  );

  return files.filter((file): file is File => file !== undefined);
};
