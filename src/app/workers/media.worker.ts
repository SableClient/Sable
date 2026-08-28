import { encode } from 'blurhash';
import { encryptAttachmentStreaming } from '$utils/attachmentCrypto';

type EncryptRequest = { id: number; type: 'encrypt'; file: Blob };
type BlurHashRequest = {
  id: number;
  type: 'blurhash';
  bitmap: ImageBitmap;
  width: number;
  height: number;
};
type Request = EncryptRequest | BlurHashRequest;

const post = (message: unknown, transfer: Transferable[] = []): void => {
  (self as unknown as { postMessage: (m: unknown, t: Transferable[]) => void }).postMessage(
    message,
    transfer
  );
};

const handleEncrypt = async (req: EncryptRequest): Promise<void> => {
  const { blob, info } = await encryptAttachmentStreaming(req.file);
  post({ id: req.id, blob, info });
};

const handleBlurHash = (req: BlurHashRequest): void => {
  const { bitmap, width, height } = req;
  try {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      post({ id: req.id, hash: undefined });
      return;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    // The canvas coerces dimensions to integers, so use imageData's real size:
    // encoding with the requested (possibly float) size mismatches the pixels array.
    post({ id: req.id, hash: encode(imageData.data, imageData.width, imageData.height, 4, 4) });
  } finally {
    bitmap.close();
  }
};

self.addEventListener('message', (event: MessageEvent<Request>): void => {
  const req = event.data;
  const run = req.type === 'encrypt' ? handleEncrypt(req) : Promise.resolve(handleBlurHash(req));
  run.catch((error: unknown) => {
    post({ id: req.id, error: error instanceof Error ? error.message : String(error) });
  });
});
