import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Avatar,
  Box,
  color as standardColors,
  Modal,
  Scroll,
  Text,
  Tooltip,
  toRem,
  Chip,
  config,
} from 'folds';
import classNames from 'classnames';
import colorMXID from '$utils/colorMXID';
import { getMxIdLocalPart } from '$utils/matrix';
import { BreakWord, LineClamp3 } from '$styles/Text.css';
import type { UserPresence } from '$hooks/useUserPresence';
import { useRoom } from '$hooks/useRoom';
import { useSableCosmetics } from '$hooks/useSableCosmetics';
import { ThemeKind, useActiveTheme } from '$hooks/useTheme';
import { useAccessibleNameColor } from '$hooks/useAccessibleNameColor';
import { useNickname } from '$hooks/useNickname';
import { useRenderableMediaUrl } from '$hooks/useRenderableMediaUrl';
import { ImageViewer } from '$components/image-viewer';
import { Image as MediaImage } from '$components/media';
import { AvatarPresence, PresenceBadge } from '$components/presence';
import { UserAvatar } from '$components/user-avatar';
import {
  CaretDown,
  CaretUp,
  Check,
  profileIcon,
  userFallbackIcon,
} from '$components/icons/phosphor';
import { ClientSideHoverFreeze } from '$components/ClientSideHoverFreeze';
import { useUserProfile } from '$hooks/useUserProfile';
import { shadeColor, areColorsTooSimilar } from '$utils/shadeColor';
import * as css from './styles.css';
import { copyToClipboard } from '$utils/dom';
import { useTimeoutToggle } from '$hooks/useTimeoutToggle';
import { CopyIcon, CrossIcon } from '@phosphor-icons/react';
import { useOpenSettings } from '$features/settings';
import { ModalOverlay } from '$components/modal-overlay/ModalOverlay';
import type { Persona } from '$app/persona';

type UserHeroProps = {
  userId: string;
  avatarUrl?: string;
  bannerUrl?: string;
  presence?: UserPresence;
  autoplayGifs?: boolean;
  showColor?: boolean;
  allowEditing?: boolean;
};
export function UserHero({
  userId,
  avatarUrl,
  bannerUrl,
  presence,
  autoplayGifs,
  allowEditing = false,
  showColor = true,
}: UserHeroProps) {
  const [viewAvatar, setViewAvatar] = useState<string>();
  const [isFullStatus, setIsFullStatus] = useState(false);

  const cachedBannerUrl = useRenderableMediaUrl(bannerUrl);
  const cachedAvatarUrl = useRenderableMediaUrl(avatarUrl);

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
    <MediaImage
      className={classNames(css.UserHeroCover, isFallbackCover && css.UserHeroCoverFallback)}
      src={coverUrl}
      alt={`${userId} cover`}
      draggable="false"
    />
  );

  const status = presence?.status;
  const isExpandable = (status?.length ?? 0) > 70;

  const fetchedProfile = useUserProfile(userId);
  const backgroundColor = fetchedProfile.heroColor ?? standardColors.Surface.Container;
  const fetchedBrightness = fetchedProfile?.heroBrightness;
  const isBackgroundDark = fetchedBrightness ? fetchedBrightness === 'dark' : undefined;
  const cardColor =
    shadeColor(backgroundColor, isBackgroundDark ? -80 : 80) ?? standardColors.Background.Container;
  const innerColor = shadeColor(backgroundColor, isBackgroundDark ? -50 : 50) ?? backgroundColor;
  const statusSurfaceColor =
    shadeColor(innerColor, fetchedBrightness === 'light' ? -14 : 32) ?? cardColor;
  const textColor =
    ((fetchedBrightness === 'dark' || areColorsTooSimilar('#000000', cardColor)) && '#FFFFFF') ||
    ((fetchedBrightness === 'light' || areColorsTooSimilar('#FFFFFF', cardColor)) && '#000000') ||
    undefined;
  const statusHoverBrightness = fetchedBrightness === 'light' ? 0.94 : 1.08;
  const openSettings = useOpenSettings();

  return (
    <Box
      direction="Column"
      className={css.UserHero}
      style={showColor ? { backgroundColor: backgroundColor } : {}}
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
                renderFallback={() => userFallbackIcon('hero')}
              />
            </Avatar>
          </AvatarPresence>
          {viewAvatar && (
            <ModalOverlay requestClose={() => setViewAvatar(undefined)}>
              <Modal size="500" onContextMenu={(evt: React.MouseEvent) => evt.stopPropagation()}>
                <ImageViewer
                  src={viewAvatar}
                  alt={userId}
                  requestClose={() => setViewAvatar(undefined)}
                />
              </Modal>
            </ModalOverlay>
          )}
        </div>
        {((status && status.length > 0) || allowEditing) && (
          <div className={css.UserHeroStatusContainer}>
            <Tooltip
              radii="400"
              variant="Surface"
              role={allowEditing ? 'button' : undefined}
              onClick={
                allowEditing
                  ? () => openSettings('account', 'status')
                  : isExpandable
                    ? () => setIsFullStatus(!isFullStatus)
                    : undefined
              }
              className={classNames(
                css.UserHeroStatusTooltip,
                isExpandable && css.UserHeroStatusTooltipInteractive
              )}
              style={{
                maxHeight: isFullStatus ? toRem(105) : toRem(48),
                cursor: allowEditing || isExpandable ? 'pointer' : 'default',
                display: 'flex',
                width: allowEditing && !status ? '100%' : 'fit-content',
                textAlign: 'center',
                padding: `${toRem(8)} ${toRem(12)}`,
                backgroundColor: statusSurfaceColor,
                color: textColor,
                borderStyle: 'none',
                borderWidth: 0,
                outline: 'none',
                boxShadow: 'inset 0 1px 1px rgba(0, 0, 0, 0.05)',
                ...({
                  '--user-hero-status-hover-brightness': String(statusHoverBrightness),
                } as CSSProperties),
              }}
            >
              <Box
                direction="Row"
                gap="100"
                style={{ height: '100%', maxWidth: '100%', flex: allowEditing ? 1 : undefined }}
              >
                {isFullStatus ? (
                  <Scroll visibility="Hover" hideTrack style={{ height: '100%', flex: 1 }}>
                    <Text
                      size="T200"
                      style={{
                        wordBreak: 'break-word',
                        fontStyle: allowEditing && !status ? 'italic' : 'normal',
                      }}
                      truncate={allowEditing}
                    >
                      {status || (allowEditing && "What's on your mind?")}
                    </Text>
                  </Scroll>
                ) : (
                  <Text
                    size="T200"
                    style={{
                      flex: 1,
                      display: '-webkit-box',
                      overflowWrap: 'anywhere',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      opacity: allowEditing && !status ? config.opacity.Placeholder : 1,
                    }}
                  >
                    {status || (allowEditing && "What's on your mind?")}
                  </Text>
                )}

                {isExpandable && !allowEditing && (
                  <Box
                    shrink="No"
                    alignItems="Center"
                    justifyContent="Center"
                    style={{
                      alignSelf: isFullStatus ? 'flex-start' : 'center',
                    }}
                  >
                    {profileIcon(isFullStatus ? CaretUp : CaretDown)}
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
  server?: string;
  customHeroCards?: boolean;
  pmp?: Persona;
  clearPmp?: () => void;
};

type UserHeroNameInnerProps = {
  shownName: string;
  username?: string;
  nick?: string;
  server?: string;
  color?: string;
  font?: string;
  customHeroCards?: boolean;
  isPmp?: boolean;
  clearPmp?: () => void;
};

function UserHeroNameInner({
  shownName,
  nick,
  username,
  server,
  color,
  font,
  isPmp,
  clearPmp,
}: UserHeroNameInnerProps) {
  const [copied, setCopied] = useTimeoutToggle();
  const [isHovered, setIsHovered] = useState(false);
  const isSuccess = useRef(false);

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
        <Chip
          onClick={(evt) => {
            evt.stopPropagation();
            if (username && server) {
              copyToClipboard(`@${username}:${server}`);
              isSuccess.current = true;
            } else isSuccess.current = false;
            setCopied();
          }}
          style={{ backgroundColor: 'transparent', color: 'inherit', padding: '0' }}
          onPointerEnter={() => setIsHovered(true)}
          onPointerLeave={() => setIsHovered(false)}
          before={
            <Text
              size="T200"
              className={classNames(BreakWord, LineClamp3)}
              title={username}
              truncate
            >{`@${username}`}</Text>
          }
          after={
            copied || isHovered ? (
              profileIcon(copied ? (isSuccess ? Check : CrossIcon) : CopyIcon)
            ) : (
              <></>
            )
          }
        />
        {isPmp && (
          <>
            {' - '}
            <Chip
              onClick={(evt) => {
                evt.stopPropagation();
                clearPmp?.();
              }}
              style={{ backgroundColor: 'transparent', color: 'inherit', padding: '0' }}
              before={
                <Text
                  size="T200"
                  className={classNames(BreakWord, LineClamp3, css.LinkUnderline)}
                  truncate
                >
                  View account profile
                </Text>
              }
            />
          </>
        )}
      </Box>
    </Box>
  );
}

export function UserHeroName({
  displayName,
  userId,
  server,
  customHeroCards,
  pmp,
  clearPmp,
}: UserHeroNameProps) {
  const username = getMxIdLocalPart(userId);
  const nick = useNickname(userId);

  // personas
  const profile = useUserProfile(userId, useRoom(), undefined, false, true);
  const themeKind =
    profile.heroBrightness === 'light'
      ? ThemeKind.Light
      : profile.heroBrightness === 'dark'
        ? ThemeKind.Dark
        : undefined;

  // had to pull this out of usePersonaCosmetics because i couldn't pass around themeKind properly.
  const activeTheme = useActiveTheme();
  const accessibleNameColor = useAccessibleNameColor(themeKind ?? activeTheme.kind);

  const pmpNameColor =
    pmp &&
    accessibleNameColor(
      (themeKind ?? activeTheme.kind) === ThemeKind.Dark
        ? pmp['eu.she-a.color']?.on_dark
        : pmp['eu.she-a.color']?.on_light
    );

  // Sable username color and fonts
  const { color, font } = useSableCosmetics(userId, useRoom(), customHeroCards);
  const shownName = pmp?.displayname ?? nick ?? displayName ?? username ?? userId;

  return (
    <UserHeroNameInner
      username={username}
      isPmp={!!pmp}
      server={server}
      shownName={shownName}
      color={pmpNameColor ?? color}
      font={font}
      clearPmp={clearPmp}
    />
  );
}

export function GlobalUserHeroName({ displayName, userId, server }: UserHeroNameProps) {
  const username = getMxIdLocalPart(userId);
  const nick = useNickname(userId);
  const profile = useUserProfile(userId);
  const activeTheme = useActiveTheme();
  const accessibleNameColor = useAccessibleNameColor(activeTheme.kind);

  const shownName = nick ?? displayName ?? username ?? userId;

  return (
    <UserHeroNameInner
      username={username}
      server={server}
      shownName={shownName}
      font={profile.resolvedFont}
      color={accessibleNameColor(profile.resolvedColor)}
    />
  );
}
