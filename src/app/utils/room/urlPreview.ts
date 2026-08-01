export const isServerUrlPreviewEnabled = (
  isEncrypted: boolean,
  urlPreview: boolean,
  encUrlPreview: boolean
) => (isEncrypted ? encUrlPreview : urlPreview);
