import { useEffect } from 'react';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';

export function SystemEmojiFeature() {
  const [twitterEmoji] = useSetting(settingsAtom, 'twitterEmoji');

  if (twitterEmoji) {
    document.documentElement.style.setProperty('--font-emoji', 'Twemoji');
  } else {
    document.documentElement.style.setProperty('--font-emoji', 'Twemoji_DISABLED');
  }

  return null;
}

export function PageZoomFeature() {
  const [pageZoom] = useSetting(settingsAtom, 'pageZoom');

  if (pageZoom === 100) {
    document.documentElement.style.removeProperty('font-size');
  } else {
    document.documentElement.style.setProperty('font-size', `calc(1em * ${pageZoom / 100})`);
  }

  return null;
}

export function PrivacyBlurFeature() {
  const [blurMedia] = useSetting(settingsAtom, 'privacyBlur');
  const [blurAvatars] = useSetting(settingsAtom, 'privacyBlurAvatars');
  const [blurEmotes] = useSetting(settingsAtom, 'privacyBlurEmotes');

  useEffect(() => {
    document.body.classList.toggle('sable-blur-media', blurMedia);
    document.body.classList.toggle('sable-blur-avatars', blurAvatars);
    document.body.classList.toggle('sable-blur-emotes', blurEmotes);
  }, [blurMedia, blurAvatars, blurEmotes]);

  return null;
}
