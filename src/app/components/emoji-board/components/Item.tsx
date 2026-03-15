import { Box } from 'folds';
import { MatrixClient } from '$types/matrix-sdk';
import { PackImageReader } from '$plugins/custom-emoji';
import { IEmoji } from '$plugins/emoji';
import { mxcUrlToHttp } from '$utils/matrix';
import { EmojiItemInfo, EmojiType } from '$components/emoji-board/types';
import * as css from './styles.css';

const ANIMATED_MIME_TYPES = new Set(['image/gif', 'image/apng']);

const isAnimatedPackImage = (image: PackImageReader): boolean => {
  const mimetype = image.info?.mimetype?.toLowerCase();
  if (mimetype && ANIMATED_MIME_TYPES.has(mimetype)) return true;

  const body = image.body?.toLowerCase();
  return !!body && (body.endsWith('.gif') || body.endsWith('.webp') || body.endsWith('.apng'));
};

const getPackImageSrc = (
  mx: MatrixClient,
  image: PackImageReader,
  useAuthentication: boolean | undefined,
  saveStickerEmojiBandwidth: boolean,
  width: number,
  height: number
): string => {
  const preserveAnimation = isAnimatedPackImage(image);

  return preserveAnimation || !saveStickerEmojiBandwidth
    ? (mxcUrlToHttp(mx, image.url, useAuthentication) ?? '')
    : (mxcUrlToHttp(mx, image.url, useAuthentication, width, height) ?? '');
};

export const getEmojiItemInfo = (element: Element): EmojiItemInfo | undefined => {
  const label = element.getAttribute('title');
  const type = element.getAttribute('data-emoji-type') as EmojiType | undefined;
  const data = element.getAttribute('data-emoji-data');
  const shortcode = element.getAttribute('data-emoji-shortcode');

  if (type && data && shortcode && label)
    return {
      type,
      data,
      shortcode,
      label,
    };
  return undefined;
};

type EmojiItemProps = {
  emoji: IEmoji;
};
export function EmojiItem({ emoji }: EmojiItemProps) {
  return (
    <Box
      as="button"
      type="button"
      alignItems="Center"
      justifyContent="Center"
      className={css.EmojiItem}
      title={emoji.label}
      aria-label={`${emoji.label} emoji`}
      data-emoji-type={EmojiType.Emoji}
      data-emoji-data={emoji.unicode}
      data-emoji-shortcode={emoji.shortcode}
    >
      {emoji.unicode}
    </Box>
  );
}

type CustomEmojiItemProps = {
  mx: MatrixClient;
  useAuthentication?: boolean;
  image: PackImageReader;
  saveStickerEmojiBandwidth: boolean;
};
export function CustomEmojiItem({
  mx,
  useAuthentication,
  image,
  saveStickerEmojiBandwidth,
}: CustomEmojiItemProps) {
  return (
    <Box
      as="button"
      type="button"
      alignItems="Center"
      justifyContent="Center"
      className={css.EmojiItem}
      title={image.body || image.shortcode}
      aria-label={`${image.body || image.shortcode} emoji`}
      data-emoji-type={EmojiType.CustomEmoji}
      data-emoji-data={image.url}
      data-emoji-shortcode={image.shortcode}
    >
      <img
        loading="lazy"
        className={css.CustomEmojiImg}
        alt={image.body || image.shortcode}
        src={getPackImageSrc(mx, image, useAuthentication, saveStickerEmojiBandwidth, 32, 32)}
      />
    </Box>
  );
}

type StickerItemProps = {
  mx: MatrixClient;
  useAuthentication?: boolean;
  image: PackImageReader;
  saveStickerEmojiBandwidth: boolean;
};

export function StickerItem({
  mx,
  useAuthentication,
  image,
  saveStickerEmojiBandwidth,
}: StickerItemProps) {
  return (
    <Box
      as="button"
      type="button"
      alignItems="Center"
      justifyContent="Center"
      className={css.StickerItem}
      title={image.body || image.shortcode}
      aria-label={`${image.body || image.shortcode} emoji`}
      data-emoji-type={EmojiType.Sticker}
      data-emoji-data={image.url}
      data-emoji-shortcode={image.shortcode}
    >
      <img
        loading="lazy"
        className={css.StickerImg}
        alt={image.body || image.shortcode}
        src={getPackImageSrc(mx, image, useAuthentication, saveStickerEmojiBandwidth, 125, 125)}
      />
    </Box>
  );
}
