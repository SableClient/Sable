// Separate from mediaUrl.ts to avoid a cycle: mediaUrl.ts imports from mediaTransport.ts.

const TAURI_MEDIA_PROTOCOL = 'sable-media://';
const TAURI_MEDIA_LOCALHOST = 'localhost';
const TAURI_MEDIA_LOCALHOST_HOST = 'sable-media.localhost';

export const getTauriMediaSourceUrl = (mediaUrl: string): string | undefined => {
  if (mediaUrl.startsWith(TAURI_MEDIA_PROTOCOL)) {
    const wrappedUrl = mediaUrl.slice(TAURI_MEDIA_PROTOCOL.length);

    if (wrappedUrl.startsWith(`${TAURI_MEDIA_LOCALHOST}/`)) {
      try {
        const parsedUrl = new URL(mediaUrl);
        if (parsedUrl.hostname !== TAURI_MEDIA_LOCALHOST) return undefined;
        return decodeURIComponent(parsedUrl.pathname.slice(1));
      } catch {
        return undefined;
      }
    }

    return wrappedUrl;
  }

  try {
    const parsedUrl = new URL(mediaUrl);
    if (
      (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') &&
      parsedUrl.hostname === TAURI_MEDIA_LOCALHOST_HOST
    ) {
      return decodeURIComponent(parsedUrl.pathname.slice(1));
    }
  } catch {
    return undefined;
  }

  return mediaUrl;
};
