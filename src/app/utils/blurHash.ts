import { encode, isBlurhashValid } from 'blurhash';
import { blurHashWorkerSupported, encodeBlurHashInWorker } from '$utils/mediaWorker';

export const encodeBlurHash = (
  img: HTMLImageElement | HTMLVideoElement,
  width?: number,
  height?: number
): string | undefined => {
  const imgWidth = img instanceof HTMLVideoElement ? img.videoWidth : img.width;
  const imgHeight = img instanceof HTMLVideoElement ? img.videoHeight : img.height;
  const canvas = document.createElement('canvas');
  canvas.width = width || imgWidth;
  canvas.height = height || imgHeight;
  const context = canvas.getContext('2d');

  if (!context) return undefined;
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  try {
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    return encode(data.data, data.width, data.height, 4, 4);
  } catch (err) {
    console.warn('Failed to encode blurhash, possibly due to cross-origin tainted canvas:', err);
    return undefined;
  }
};

export const encodeBlurHashAsync = async (
  img: HTMLImageElement | HTMLVideoElement,
  width: number,
  height: number
): Promise<string | undefined> => {
  if (blurHashWorkerSupported()) {
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(img, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: 'low',
      });
      return await encodeBlurHashInWorker(bitmap, width, height);
    } catch {
      bitmap?.close();
    }
  }
  return encodeBlurHash(img, width, height);
};

export const validBlurHash = (hash?: string): string | undefined => {
  if (typeof hash === 'string') {
    const validity = isBlurhashValid(hash);

    return validity.result ? hash : undefined;
  }

  return undefined;
};
