import { isJumboEmojiText } from '$utils/emojiDetection';
import { Image as MediaImage } from '$components/media';
import { useRenderableMediaUrl } from '$hooks/useRenderableMediaUrl';
import * as css from './style.css';

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'sable-media:', 'blob:']);

type PowerIconProps = css.PowerIconVariants & {
  iconSrc: string;
  name?: string;
};

export function PowerIcon({ size, iconSrc, name }: PowerIconProps) {
  const resolvedSrc = useRenderableMediaUrl(iconSrc);

  if (isJumboEmojiText(iconSrc, 1)) {
    return <span className={css.PowerIcon({ size })}>{iconSrc}</span>;
  }

  if (!resolvedSrc) return null;

  let safeUrl: string | undefined;
  try {
    const parsed = new URL(resolvedSrc);
    safeUrl = SAFE_PROTOCOLS.has(parsed.protocol) ? parsed.href : undefined;
  } catch {
    safeUrl = undefined;
  }
  if (!safeUrl) return null;

  return <MediaImage className={css.PowerIcon({ size })} src={safeUrl} alt={name} />;
}
