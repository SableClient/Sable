import type { PackContent } from '$plugins/custom-emoji';
import { ImageUsage } from '$plugins/custom-emoji';

import type { IImageInfo } from '$types/matrix/common';
import type { MatrixClient } from '$types/matrix-sdk';
import { CustomAccountDataEvent } from '$types/matrix/accountData';

// Utility function to add a sticker to the default sticker pack
// For now this only works for unencrypted stickers
export async function addStickerToDefaultPack(
  mx: MatrixClient,
  shortcode: string,
  mxc: string,
  body?: string,
  info?: IImageInfo
) {
  // current content of the default sticker pack, which is stored in account data under the key 'PoniesUserEmotes'
  const current =
    mx.getAccountData(CustomAccountDataEvent.PoniesUserEmotes)?.getContent<PackContent>() ?? {};

  // modified content with the new sticker added.
  // We add the new sticker under the "images" key, using the shortcode as the key for the sticker.
  // The sticker content includes the mxc URL, body, info, and usage (which we set to "sticker").
  const next: PackContent = {
    ...current,
    images: {
      ...current.images,
      [shortcode]: {
        ...current.images?.[shortcode],
        url: mxc,
        body,
        info,
        usage: [ImageUsage.Sticker],
      },
    },
  };

  // update the account data with the modified content, which effectively adds the new sticker to the default sticker pack.
  await mx.setAccountData(CustomAccountDataEvent.PoniesUserEmotes, next);
}

// check if a sticker exists in the account sticker pack
export function doesStickerExistInDefaultPack(mx: MatrixClient, mxc: string) {
  const imgs = mx
    .getAccountData(CustomAccountDataEvent.PoniesUserEmotes)
    ?.getContent<PackContent>().images;
  if (imgs === undefined) return false;
  return Object.values(imgs).some((image) => image.url === mxc) ?? false;
}
