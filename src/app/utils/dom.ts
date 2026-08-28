import { isTauri } from '@tauri-apps/api/core';
import { fetchMediaBlob, type MediaTransportOptions } from './mediaTransport';

export const targetFromEvent = (evt: Event, selector: string): Element | undefined => {
  const targets = evt.composedPath() as Element[];
  return targets.find((target) => target.matches?.(selector));
};

export const editableActiveElement = (): boolean =>
  !!document.activeElement &&
  (document.activeElement.nodeName.toLowerCase() === 'input' ||
    document.activeElement.nodeName.toLowerCase() === 'textarea' ||
    document.activeElement.getAttribute('contenteditable') === 'true' ||
    document.activeElement.getAttribute('role') === 'input' ||
    document.activeElement.getAttribute('role') === 'textarea');

export type FilesOrFile<T extends boolean | undefined = undefined> = T extends true ? File[] : File;

const getFilesFromFileList = (fileList: FileList): File[] => {
  const files: File[] = [];

  for (let i = 0; i < fileList.length; i += 1) {
    const file: File | undefined = fileList[i];
    if (file instanceof File) files.push(file);
  }

  return files;
};

export const selectFile = <M extends boolean | undefined = undefined>(
  accept: string,
  multiple?: M
): Promise<FilesOrFile<M> | undefined> =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    if (multiple) input.multiple = true;

    const changeHandler = () => {
      const fileList = input.files;
      if (!fileList) {
        resolve(undefined);
      } else {
        const files: File[] = getFilesFromFileList(fileList);
        resolve((multiple ? files : files[0]) as FilesOrFile<M>);
      }
      input.removeEventListener('change', changeHandler);
    };

    input.addEventListener('change', changeHandler);
    input.click();
  });

export const getDataTransferFiles = (dataTransfer: DataTransfer): File[] | undefined => {
  const fileList = dataTransfer.files;
  const files: File[] = getFilesFromFileList(fileList);
  if (files.length === 0) return undefined;
  return files;
};

export const renameFile = (file: File, name: string): File =>
  new File([file], name, { type: file.type });

export const getImageFileUrl = (fileOrBlob: File | Blob) => URL.createObjectURL(fileOrBlob);

export const getVideoFileUrl = (fileOrBlob: File | Blob) => URL.createObjectURL(fileOrBlob);

export const loadImageElement = (url: string, crossOrigin?: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = document.createElement('img');
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', (err) => reject(err));
    img.src = url;
  });

export const loadVideoElement = (url: string): Promise<HTMLVideoElement> =>
  new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.playsInline = true;
    video.muted = true;

    video.addEventListener('loadeddata', () => {
      resolve(video);
      video.pause();
    });
    video.addEventListener('error', (e) => {
      reject(e);
    });

    video.src = url;
    video.load();
    video.play();
  });

export const getThumbnailDimensions = (width: number, height: number): [number, number] => {
  const MAX_WIDTH = 400;
  const MAX_HEIGHT = 300;
  let targetWidth = width;
  let targetHeight = height;
  if (targetHeight > MAX_HEIGHT) {
    targetWidth = Math.floor(targetWidth * (MAX_HEIGHT / targetHeight));
    targetHeight = MAX_HEIGHT;
  }
  if (targetWidth > MAX_WIDTH) {
    targetHeight = Math.floor(targetHeight * (MAX_WIDTH / targetWidth));
    targetWidth = MAX_WIDTH;
  }
  return [targetWidth, targetHeight];
};

export const getThumbnail = (
  img: HTMLImageElement | SVGImageElement | HTMLVideoElement,
  width: number,
  height: number,
  thumbnailMimeType?: string
): Promise<Blob | undefined> =>
  new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      resolve(undefined);
      return;
    }
    context.drawImage(img, 0, 0, width, height);

    canvas.toBlob((thumbnail) => {
      resolve(thumbnail ?? undefined);
    }, thumbnailMimeType ?? 'image/jpeg');
  });

export const scrollToBottom = (scrollEl: HTMLElement, behavior?: 'auto' | 'instant' | 'smooth') => {
  scrollEl.scrollTo({
    top: Math.round(scrollEl.scrollHeight - scrollEl.offsetHeight),
    behavior,
  });
};

async function getBitmap(blob: Blob): Promise<ImageBitmap> {
  if (!blob.type.startsWith('image/svg+xml')) return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();

    await new Promise<void>((resolve, reject) => {
      img.addEventListener('load', () => resolve(), { once: true });
      img.addEventListener('error', reject, { once: true });
      img.src = url;
    });

    return await createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const copyImageToClipboard = async (blob: Blob): Promise<boolean> => {
  const bitmap = await getBitmap(blob);

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext('2d');
  ctx?.drawImage(bitmap, 0, 0);

  const finalBlob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
    }, 'image/png');
  });

  if (isTauri()) {
    try {
      const [{ writeImage }, { Image }] = await Promise.all([
        import('@tauri-apps/plugin-clipboard-manager'),
        import('@tauri-apps/api/image'),
      ]);
      const image = await Image.fromBytes(await finalBlob.arrayBuffer());
      await writeImage(image);
      return true;
    } catch {
      // fall back to the web clipboard API
    }
  }

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': finalBlob,
      }),
    ]);

    return true;
  } catch {
    return false;
  }
};

const legacyCopyToClipboard = (text: string): boolean => {
  const copyInput = document.createElement('input');
  copyInput.style.position = 'fixed';
  copyInput.style.opacity = '0';
  copyInput.value = text;
  document.body.append(copyInput);

  copyInput.select();
  copyInput.setSelectionRange(0, 99999);

  let copied = false;
  try {
    copied = document.execCommand('Copy');
  } catch {
    copied = false;
  }

  copyInput.remove();
  return copied;
};

// navigator.clipboard rejects on WebKitGTK (Tauri/Linux); prefer the native plugin.
export const copyToClipboard = async (text: string): Promise<boolean> => {
  if (isTauri()) {
    try {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
      await writeText(text);
      return true;
    } catch {
      // fall back to the web clipboard API
    }
  }

  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall back to execCommand
    }
  }

  return legacyCopyToClipboard(text);
};

export const readClipboardText = async (): Promise<string> => {
  if (isTauri()) {
    try {
      const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
      return await readText();
    } catch {
      // fall back to the web clipboard API
    }
  }

  return navigator.clipboard.readText();
};

export const setFavicon = (url: string): void => {
  const favicon = document.querySelector('#favicon');
  if (!favicon) return;
  favicon.setAttribute('href', url);
};

export const syntaxErrorPosition = (error: SyntaxError): number | undefined => {
  const match = error.message.match(/position\s(\d+)\s/);
  if (!match) return undefined;

  const posStr = match[1]!;
  const position = parseInt(posStr, 10);
  if (Number.isNaN(position)) return undefined;
  return position;
};

export const notificationPermission = (permission: NotificationPermission) => {
  if ('Notification' in window) {
    return window.Notification.permission === permission;
  }
  return false;
};

export const getMouseEventCords = (event: MouseEvent) => ({
  x: event.clientX,
  y: event.clientY,
  width: 0,
  height: 0,
});

export const downloadTextFile = (
  content: string,
  filename: string,
  mimeType = 'text/css'
): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const loadImageElementFromMediaUrl = async (
  url: string,
  options?: MediaTransportOptions
): Promise<{ blob: Blob; image: HTMLImageElement }> => {
  const blob = await fetchMediaBlob(url, options);
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await loadImageElement(objectUrl);
    return { blob, image };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

// Can the page be seen? Governs in-app UI and the service-worker push hand-off.
export const isPageVisible = (): boolean => document.visibilityState === 'visible';

// Stricter than visibility: a second monitor is visible but unfocused. Desktop
// overrides it from the OS, which sees app switches that focusin/focusout miss.
let nativeWindowFocused: boolean | undefined;
const windowFocusListeners = new Set<(focused: boolean) => void>();

export const isWindowFocused = (): boolean => nativeWindowFocused ?? document.hasFocus();

// undefined releases the override and restores the DOM fallback.
export const setNativeWindowFocused = (focused: boolean | undefined): void => {
  if (nativeWindowFocused === focused) return;
  nativeWindowFocused = focused;
  const resolved = isWindowFocused();
  windowFocusListeners.forEach((listener) => listener(resolved));
};

export const subscribeWindowFocus = (listener: (focused: boolean) => void): (() => void) => {
  windowFocusListeners.add(listener);
  return () => {
    windowFocusListeners.delete(listener);
  };
};
