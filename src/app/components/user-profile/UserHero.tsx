import { useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Icon,
  Icons,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Scroll,
  Text,
  Tooltip,
  toRem,
} from 'folds';
import classNames from 'classnames';
import FocusTrap from 'focus-trap-react';
import colorMXID from '$utils/colorMXID';
import { getMxIdLocalPart } from '$utils/matrix';
import { BreakWord, LineClamp3 } from '$styles/Text.css';
import { UserPresence } from '$hooks/useUserPresence';
import { stopPropagation } from '$utils/keyboard';
import { useRoom } from '$hooks/useRoom';
import { useSableCosmetics } from '$hooks/useSableCosmetics';
import { useNickname } from '$hooks/useNickname';
import { useBlobCache } from '$hooks/useBlobCache';
import { ImageViewer } from '$components/image-viewer';
import { AvatarPresence, PresenceBadge } from '$components/presence';
import { UserAvatar } from '$components/user-avatar';
import { ClientSideHoverFreeze } from '$components/ClientSideHoverFreeze';
import { useUserProfile } from '$hooks/useUserProfile';
import * as css from './styles.css';

type UserHeroProps = {
  userId: string;
  avatarUrl?: string;
  bannerUrl?: string;
  presence?: UserPresence;
  autoplayGifs?: boolean;
};
export function UserHero({ userId, avatarUrl, bannerUrl, presence, autoplayGifs }: UserHeroProps) {
  const [viewAvatar, setViewAvatar] = useState<string>();
  const [isFullStatus, setIsFullStatus] = useState(false);

  const cachedBannerUrl = useBlobCache(bannerUrl);
  const cachedAvatarUrl = useBlobCache(avatarUrl);

  const coverUrl = cachedBannerUrl || cachedAvatarUrl;
  const isFallbackCover = !cachedBannerUrl && !!cachedAvatarUrl;

  const isAnimated = useMemo(() => {
    if (!coverUrl) return false;
    const url = coverUrl.toLowerCase();
    const isStatic = url.endsWith('.jpg') || url.endsWith('.jpeg') || url.endsWith('.png');

    return !isStatic || url.includes('gif') || url.includes('webp');
  }, [coverUrl]);

  const bannerClasses = classNames(css.UserHeroCover, isFallbackCover && css.UserHeroCoverFallback);

  const renderCoverImage = () => (
    <img
      className={classNames(css.UserHeroCover, isFallbackCover && css.UserHeroCoverFallback)}
      src={coverUrl}
      alt={`${userId} cover`}
      draggable="false"
    />
  );

  const status = presence?.status;
  const isExpandable = (status?.length ?? 0) > 70;

  const fetchedProfile = useUserProfile(userId);

  return (
    <Box
      direction="Column"
      className={css.UserHero}
      style={{ backgroundColor: fetchedProfile?.heroColorScheme?.color }}
    >
      <div
        className={css.UserHeroCoverContainer}
        style={{
          backgroundColor: colorMXID(userId),
        }}
      >
        {coverUrl && (
          <>
            {isAnimated && !autoplayGifs ? (
              <ClientSideHoverFreeze src={coverUrl} className={bannerClasses}>
                {renderCoverImage()}
              </ClientSideHoverFreeze>
            ) : (
              renderCoverImage()
            )}
          </>
        )}
      </div>
      <Box direction="Row" className={css.UserHeroAvatarStatusContainer}>
        <div className={css.UserHeroAvatarContainer}>
          <AvatarPresence
            className={css.UserAvatarContainer}
            badge={presence && <PresenceBadge presence={presence.presence} />}
          >
            <Avatar
              as={avatarUrl ? 'button' : 'div'}
              onClick={avatarUrl ? () => setViewAvatar(avatarUrl) : undefined}
              className={css.UserHeroAvatar}
              size="500"
            >
              <UserAvatar
                className={css.UserHeroAvatarImg}
                userId={userId}
                src={avatarUrl}
                alt={userId}
                renderFallback={() => <Icon size="500" src={Icons.User} filled />}
              />
            </Avatar>
          </AvatarPresence>
          {viewAvatar && (
            <Overlay open backdrop={<OverlayBackdrop />}>
              <OverlayCenter>
                <FocusTrap
                  focusTrapOptions={{
                    initialFocus: false,
                    onDeactivate: () => setViewAvatar(undefined),
                    clickOutsideDeactivates: true,
                    escapeDeactivates: stopPropagation,
                  }}
                >
                  <Modal size="500" onContextMenu={(evt: any) => evt.stopPropagation()}>
                    <ImageViewer
                      src={viewAvatar}
                      alt={userId}
                      requestClose={() => setViewAvatar(undefined)}
                    />
                  </Modal>
                </FocusTrap>
              </OverlayCenter>
            </Overlay>
          )}
        </div>
        {status && status.length > 0 && (
          <div className={css.UserHeroStatusContainer}>
            <Tooltip
              onClick={isExpandable ? () => setIsFullStatus(!isFullStatus) : undefined}
              className={css.UserHeroStatusTooltip}
              style={{
                maxHeight: isFullStatus ? toRem(105) : toRem(48),
                cursor: isExpandable ? 'pointer' : 'default',
                transform: 'none',
                transition: 'none',
                display: 'flex',
              }}
            >
              <Box direction="Row" gap="100" style={{ height: '100%', width: '100%' }}>
                {isFullStatus ? (
                  <Scroll visibility="Hover" hideTrack style={{ height: '100%', flex: 1 }}>
                    <Text size="T200" style={{ wordBreak: 'break-word' }}>
                      {status}
                    </Text>
                  </Scroll>
                ) : (
                  <Text
                    size="T200"
                    style={{
                      flex: 1,
                      wordBreak: 'break-word',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {status}
                  </Text>
                )}

                {isExpandable && (
                  <Box
                    shrink="No"
                    alignItems="Center"
                    justifyContent="Center"
                    style={{ alignSelf: isFullStatus ? 'flex-start' : 'center' }}
                  >
                    <Icon size="50" src={isFullStatus ? Icons.ChevronTop : Icons.ChevronBottom} />
                  </Box>
                )}
              </Box>
            </Tooltip>
          </div>
        )}
      </Box>
    </Box>
  );
}

type UserHeroNameProps = {
  displayName?: string;
  userId: string;
};
export function UserHeroName({ displayName, userId }: UserHeroNameProps) {
  const username = getMxIdLocalPart(userId);
  const nick = useNickname(userId);

  // Sable username color and fonts
  const { color, font } = useSableCosmetics(userId, useRoom());
  const shownName = nick ?? displayName ?? username ?? userId;

  return (
    <Box grow="Yes" direction="Column" gap="0">
      <Box alignItems="Baseline" gap="200" wrap="Wrap">
        <Text
          size="H4"
          className={classNames(BreakWord, LineClamp3)}
          title={shownName}
          style={{ color, fontFamily: font }}
        >
          {shownName}
        </Text>
        {nick && (
          <Text size="T200" priority="300" title={`Nickname (real: ${username})`}>
            (nick)
          </Text>
        )}
      </Box>
      <Box alignItems="Center" gap="100" wrap="Wrap">
        <Text size="T200" className={classNames(BreakWord, LineClamp3)} title={username}>
          @{username}
        </Text>
      </Box>
    </Box>
  );
}
