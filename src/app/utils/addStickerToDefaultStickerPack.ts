import { PackContent, ImageUsage } from '$plugins/custom-emoji';
import { AccountDataEvent } from '$types/matrix/accountData';
import { IImageInfo } from '$types/matrix/common';
import { MatrixClient } from 'matrix-js-sdk';

// Utility function to add a sticker to the default sticker pack
export async function addStickerToDefaultPack(
  mx: MatrixClient,
  shortcode: string,
  mxc: string,
  body?: string,
  info?: IImageInfo
) {
  // current content of the default sticker pack, which is stored in account data under the key 'PoniesUserEmotes'
  const current =
    mx.getAccountData(AccountDataEvent.PoniesUserEmotes)?.getContent<PackContent>() ?? {};

  // modified content with the new sticker added.
  // We add the new sticker under the "images" key, using the shortcode as the key for the sticker.
  // The sticker content includes the mxc URL, body, info, and usage (which we set to "sticker").
  const next: PackContent = {
    ...current,
    images: {
      ...(current.images ?? {}),
      [shortcode]: {
        ...(current.images?.[shortcode] ?? {}),
        url: mxc,
        body,
        info,
        usage: [ImageUsage.Sticker],
      },
    },
  };

  // update the account data with the modified content, which effectively adds the new sticker to the default sticker pack.
  await mx.setAccountData(AccountDataEvent.PoniesUserEmotes, next);
}

// check if a sticker exists in the account sticker pack
export function doesStickerExistInDefaultPack(mx: MatrixClient, mxc: string) {
  const imgs = mx
    .getAccountData(AccountDataEvent.PoniesUserEmotes)
    ?.getContent<PackContent>().images;
  if (imgs === undefined) return false;
  return Object.values(imgs).some((image) => image.url === mxc) ?? false;
}
