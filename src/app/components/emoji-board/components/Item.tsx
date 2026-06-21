import { Box, color, config, Menu, MenuItem } from 'folds';
import type { MatrixClient } from '$types/matrix-sdk';
import type { PackImageReader } from '$plugins/custom-emoji';
import type { IEmoji } from '$plugins/emoji';
import { mxcUrlToHttp } from '$utils/matrix';
import { EmojiItemInfo, EmojiType, GifData } from '$components/emoji-board/types';
import { CSSProperties, ReactNode, useEffect, useState } from 'react';
import * as css from './styles.css';
import { useFavoriteGifs } from '$hooks/useFavoriteGifs';
import { Star, menuIcon } from '$components/icons/phosphor';
import { MATRIX_SABLE_UNSTABLE_FAVORITE_GIFS } from '$unstable/prefixes';
import { useMatrixClient } from '$hooks/useMatrixClient';
import classNames from 'classnames';

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

export function GifItem({
  label,
  type,
  data,
  shortcode,
  gif,
  style,
  children,
}: {
  label: string;
  type: EmojiType;
  data: string;
  shortcode: string;
  gif: GifData;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const initialFavorited = useFavoriteGifs();
  const [favoritedContent, setFavoritedContent] = useState(initialFavorited);
  const [favorited, setFavorited] = useState(
    favoritedContent.gifs.find((v) => v.url == gif?.url) != undefined
  );
  const mx = useMatrixClient();

  useEffect(() => {
    setFavoritedContent(initialFavorited);
  }, [initialFavorited]);

  return (
    <Box
      as="button"
      className={css.GifItem}
      type="button"
      style={style}
      alignItems="Center"
      justifyContent="Center"
      title={label}
      aria-label={`${label} gif`}
      data-emoji-type={type}
      data-emoji-data={data}
      data-emoji-shortcode={shortcode}
      data-gif-data={gif ? JSON.stringify(gif) : undefined}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
    >
      {children}
      {isHovered && (
        <Box style={{ padding: config.space.S200, right: 0, top: 0, position: 'absolute' }}>
          <Menu style={{ padding: config.space.S0 }}>
            <Box>
              <MenuItem
                size="300"
                radii="0"
                fill="Soft"
                variant="Secondary"
                title={favorited ? 'Unfavorite gif' : 'Favorite gif'}
                onClick={async (e) => {
                  e.preventDefault();
                  if (!favorited) {
                    setFavorited(true);
                    await mx
                      .setAccountData(MATRIX_SABLE_UNSTABLE_FAVORITE_GIFS, {
                        gifs: [...favoritedContent.gifs, gif],
                      })
                      .catch(() => setFavorited(false));
                  } else {
                    setFavorited(false);
                    await mx
                      .setAccountData(MATRIX_SABLE_UNSTABLE_FAVORITE_GIFS, {
                        gifs: favoritedContent.gifs.filter((v) => v.url != gif.url),
                      })
                      .catch(() => setFavorited(true));
                  }
                }}
              >
                {menuIcon(Star, {
                  weight: favorited ? 'fill' : 'regular',
                  color: favorited ? color.Warning.MainHover : color.Surface.OnContainer,
                })}
              </MenuItem>
            </Box>
          </Menu>
        </Box>
      )}
    </Box>
  );
}
