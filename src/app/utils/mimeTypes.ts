const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/gif',
  'image/png',
  'image/apng',
  'image/webp',
  'image/avif',
  'image/svg+xml',
];

const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];

const AUDIO_MIME_TYPES = [
  'audio/mp4',
  'audio/x-m4a',
  'audio/webm',
  'audio/aac',
  'audio/mpeg',
  'audio/ogg',
  'audio/wave',
  'audio/wav',
  'audio/x-wav',
  'audio/x-pn-wav',
  'audio/flac',
  'audio/x-flac',
];

const APPLICATION_MIME_TYPES = [
  'application/pdf',
  'application/json',
  'application/x-tgsticker',
  'application/x-sh',
  'application/ecmascript',
  'application/javascript',
  'application/xhtml+xml',
  'application/xml',
];

const TEXT_MIME_TYPE = [
  'text/plain',
  'text/html',
  'text/css',
  'text/javascript',
  'text/x-c',
  'text/csv',
  'text/tab-separated-values',
  'text/yaml',
  'text/x-java-source,java',
  'text/markdown',
];

export const READABLE_TEXT_MIME_TYPES = [
  'application/json',
  'application/x-sh',
  'application/ecmascript',
  'application/javascript',
  'application/xhtml+xml',
  'application/xml',

  ...TEXT_MIME_TYPE,
];

export const READABLE_EXT_TO_MIME_TYPE: Record<string, string> = {
  go: 'text/go',
  rs: 'text/rust',
  py: 'text/python',
  swift: 'text/swift',
  c: 'text/c',
  cpp: 'text/cpp',
  java: 'text/java',
  kt: 'text/kotlin',
  lua: 'text/lua',
  php: 'text/php',
  ts: 'text/typescript',
  js: 'text/javascript',
  jsx: 'text/jsx',
  tsx: 'text/tsx',
  html: 'text/html',
  xhtml: 'text/xhtml',
  xht: 'text/xhtml',
  css: 'text/css',
  scss: 'text/scss',
  sass: 'text/sass',
  json: 'text/json',
  md: 'text/markdown',
  yaml: 'text/yaml',
  yni: 'text/yni',
  xml: 'text/xml',
  txt: 'text/plain',
  text: 'text/plain',
  conf: 'text/conf',
  cfg: 'text/conf',
  cnf: 'text/conf',
  log: 'text/log',
  me: 'text/me',
  cvs: 'text/cvs',
  tvs: 'text/tvs',
  sql: 'text/sql',
};

const ALLOWED_BLOB_MIME_TYPES = new Set([
  ...IMAGE_MIME_TYPES,
  ...VIDEO_MIME_TYPES,
  ...AUDIO_MIME_TYPES,
  ...APPLICATION_MIME_TYPES,
  ...TEXT_MIME_TYPE,
]);

export const FALLBACK_MIMETYPE = 'application/octet-stream';
export const TGS_MIMETYPE = 'application/x-tgsticker';

export const isTgsMimeType = (mimeType: string): boolean =>
  mimeType.split(';', 1)[0]?.toLowerCase() === TGS_MIMETYPE;

export const isImageMimeType = (mimeType: string): boolean =>
  mimeType.toLowerCase().startsWith('image/') || isTgsMimeType(mimeType);

const isTgsCandidate = (file: File): boolean =>
  file.name.toLowerCase().endsWith('.tgs') || isTgsMimeType(file.type);

export const isTgsFile = async (file: File): Promise<boolean> => {
  if (!isTgsCandidate(file)) return false;
  try {
    const signature = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    return signature[0] === 0x1f && signature[1] === 0x8b;
  } catch {
    return false;
  }
};

export const getBlobSafeMimeType = (mimeType: string): string => {
  if (typeof mimeType !== 'string') return FALLBACK_MIMETYPE;
  const [type] = mimeType.split(';');
  if (!type || !ALLOWED_BLOB_MIME_TYPES.has(type)) {
    return FALLBACK_MIMETYPE;
  }
  // Required for Chromium browsers
  if (type === 'video/quicktime') {
    return 'video/mp4';
  }
  return type;
};

export const safeFile = (f: File) => {
  const safeType = getBlobSafeMimeType(f.type);
  if (safeType !== f.type) {
    return new File([f], f.name, { type: safeType });
  }
  return f;
};

export const safeUploadFile = async (file: File): Promise<File> => {
  if (await isTgsFile(file)) {
    return file.type === TGS_MIMETYPE
      ? file
      : new File([file], file.name, { type: TGS_MIMETYPE, lastModified: file.lastModified });
  }
  if (isTgsMimeType(file.type)) {
    return new File([file], file.name, {
      type: FALLBACK_MIMETYPE,
      lastModified: file.lastModified,
    });
  }
  return safeFile(file);
};

export const mimeTypeToExt = (mimeType: string): string => {
  const extStart = mimeType.lastIndexOf('/') + 1;
  return mimeType.slice(extStart);
};
export const getFileNameExt = (fileName: string): string => {
  const extStart = fileName.lastIndexOf('.') + 1;
  return fileName.slice(extStart);
};
export const getFileNameWithoutExt = (fileName: string): string => {
  const extStart = fileName.lastIndexOf('.');
  if (extStart === 0 || extStart === -1) return fileName;
  return fileName.slice(0, extStart);
};
