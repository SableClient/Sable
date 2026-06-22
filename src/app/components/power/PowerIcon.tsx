import { AuthenticatedImg } from '$components/AuthenticatedImg';
import { isJumboEmojiText } from '$utils/emojiDetection';
import * as css from './style.css';

type PowerIconProps = css.PowerIconVariants & {
  iconSrc: string;
  name?: string;
};

const ALLOWED_ICON_PROTOCOLS = new Set(['http:', 'https:']);

function getSafeIconUrl(iconSrc: string): string | undefined {
  if (iconSrc.startsWith('mxc://')) {
    return iconSrc;
  }

  try {
    const parsed = new URL(iconSrc);
    return ALLOWED_ICON_PROTOCOLS.has(parsed.protocol) ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

export function PowerIcon({ size, iconSrc, name }: PowerIconProps) {
  if (isJumboEmojiText(iconSrc, 1)) {
    return <span className={css.PowerIcon({ size })}>{iconSrc}</span>;
  }

  const safeIconUrl = getSafeIconUrl(iconSrc);
  if (!safeIconUrl) return null;

  return <AuthenticatedImg className={css.PowerIcon({ size })} src={safeIconUrl} alt={name} />;
}
