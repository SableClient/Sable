import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { matchRoomIdOrAlias } from '$pages/pathUtils';
import { useResolvedRoomIdOrAlias } from '$hooks/router/useResolvedRoomId';

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
  const [perRoomBlur] = useSetting(settingsAtom, 'perRoomPrivacyBlur');

  const location = useLocation();
  // Read straight from the URL rather than any "last visited room" bookkeeping,
  // so this works on a fresh load/refresh and not just after in-app navigation.
  const roomIdOrAlias = matchRoomIdOrAlias(location.pathname);
  const { roomId: activeRoomId } = useResolvedRoomIdOrAlias(roomIdOrAlias);
  const roomOverride = activeRoomId
    ? perRoomBlur.find((entry) => entry.roomId === activeRoomId)
    : undefined;
  const effectiveBlurMedia = roomOverride ? roomOverride.blur : blurMedia;

  useEffect(() => {
    document.body.classList.toggle('sable-blur-media', effectiveBlurMedia);
    document.body.classList.toggle('sable-blur-avatars', blurAvatars);
    document.body.classList.toggle('sable-blur-emotes', blurEmotes);
  }, [effectiveBlurMedia, blurAvatars, blurEmotes]);

  return null;
}
