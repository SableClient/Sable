import { Box, color, config, Menu, MenuItem } from 'folds';
import type { MatrixClient } from '$types/matrix-sdk';
import type { PackImageReader } from '$plugins/custom-emoji';
import type { IEmoji } from '$plugins/emoji';
import { mxcUrlToHttp } from '$utils/matrix';
import type { EmojiItemInfo, GifData } from '$components/emoji-board/types';
import { EmojiType } from '$components/emoji-board/types';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import * as css from './styles.css';
import { useFavoriteGifs } from '$hooks/useFavoriteGifs';
import { Star, Eye, EyeSlash, menuIcon } from '$components/icons/phosphor';
import { MATRIX_SABLE_UNSTABLE_FAVORITE_GIFS } from '$unstable/prefixes';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useClientConfig } from '$hooks/useClientConfig';
import { getKlipyMxcUrl } from '$utils/klipy';

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
  const favoritedContent = useFavoriteGifs();
  const clientConfig = useClientConfig();

  const mxcUrl = gif?.url ? getKlipyMxcUrl(gif.url, clientConfig.gifs?.proxyUrl) : '';

  const [favorited, setFavorited] = useState(
    favoritedContent.gifs.some((v) => {
      const vMxc = getKlipyMxcUrl(v.url, clientConfig.gifs?.proxyUrl);
      return vMxc === mxcUrl && mxcUrl !== '';
    })
  );
  const [isSpoiler, setIsSpoiler] = useState(false);
  const mx = useMatrixClient();

  useEffect(() => {
    setFavorited(
      favoritedContent.gifs.some((v) => {
        const vMxc = getKlipyMxcUrl(v.url, clientConfig.gifs?.proxyUrl);
        return vMxc === mxcUrl && mxcUrl !== '';
      })
    );
  }, [favoritedContent, mxcUrl, clientConfig.gifs?.proxyUrl]);

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
      data-gif-spoiler={isSpoiler ? 'true' : 'false'}
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
                  e.stopPropagation();
                  if (!favorited) {
                    setFavorited(true);
                    await mx
                      .setAccountData(MATRIX_SABLE_UNSTABLE_FAVORITE_GIFS, {
                        gifs: [
                          ...favoritedContent.gifs,
                          {
                            title: gif.title,
                            url: mxcUrl,
                            width: gif.width,
                            height: gif.height,
                            size: gif.size,
                          },
                        ],
                      })
                      .catch(() => setFavorited(false));
                  } else {
                    setFavorited(false);
                    await mx
                      .setAccountData(MATRIX_SABLE_UNSTABLE_FAVORITE_GIFS, {
                        gifs: favoritedContent.gifs.filter(
                          (v) => getKlipyMxcUrl(v.url, clientConfig.gifs?.proxyUrl) !== mxcUrl
                        ),
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
              <MenuItem
                size="300"
                radii="0"
                fill="Soft"
                variant="Secondary"
                title={isSpoiler ? 'Remove spoiler' : 'Mark as spoiler'}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsSpoiler(!isSpoiler);
                }}
              >
                {menuIcon(isSpoiler ? EyeSlash : Eye, {
                  weight: isSpoiler ? 'fill' : 'regular',
                  color: color.Surface.OnContainer,
                })}
              </MenuItem>
            </Box>
          </Menu>
        </Box>
      )}
    </Box>
  );
}
