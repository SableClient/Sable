import {
  Box,
  Button,
  color,
  config,
  Icon,
  Icons,
  Menu,
  MenuItem,
  Scroll,
  Text,
  toRem,
} from 'folds';
import type { CSSProperties, SyntheticEvent } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import type { Opts as LinkifyOpts } from 'linkifyjs';
import type { HTMLReactParserOptions } from 'html-react-parser';
import { mxcUrlToHttp } from '$utils/matrix';
import { getMemberAvatarMxc, getMemberDisplayName } from '$utils/room';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { usePowerLevels } from '$hooks/usePowerLevels';
import { useRoom } from '$hooks/useRoom';
import { useUserPresence } from '$hooks/useUserPresence';
import { useCloseUserRoomProfile } from '$state/hooks/userRoomProfile';
import { useIgnoredUsers } from '$hooks/useIgnoredUsers';
import { useMembership } from '$hooks/useMembership';

import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { useMemberPowerCompare } from '$hooks/useMemberPowerCompare';
import { getDirectCreatePath, withSearchParam } from '$pages/pathUtils';
import type { DirectCreateSearchParams } from '$pages/paths';
import { nicknamesAtom } from '$state/nicknames';
import type { UserProfile } from '$hooks/useUserProfile';
import { useUserProfile } from '$hooks/useUserProfile';
import {
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  makeMentionCustomProps,
  renderMatrixMention,
} from '$plugins/react-custom-html-parser';
import { useSpoilerClickHandler } from '$hooks/useSpoilerClickHandler';
import { RenderBody } from '$components/message';
import { getSettings, settingsAtom } from '$state/settings';
import { filterPronounsByLanguage } from '$utils/pronouns';
import { useSetting } from '$state/hooks/settings';
import { useSettingsLinkBaseUrl } from '$features/settings/useSettingsLinkBaseUrl';
import { getMxIdServer } from '$utils/mxIdHelper';
import { TextViewerContent } from '$components/text-viewer';
import { areColorsTooSimilar, shadeColor } from '$utils/shadeColor';
import { ThemeKind, useTheme } from '$hooks/useTheme';
import { heroMenuItemStyle } from './heroMenuItemStyle';
import { CreatorChip } from './CreatorChip';
import { UserInviteAlert, UserBanAlert, UserModeration, UserKickAlert } from './UserModeration';
import { PowerChip } from './PowerChip';
import { IgnoredUserAlert, MutualRoomsChip, OptionsChip, ServerChip, ShareChip } from './UserChips';
import { UserHero, UserHeroName } from './UserHero';
import { KnownMembership } from '$types/matrix-sdk';
import * as css from './styles.css';
import * as prefix from '$unstable/prefixes';

const KNOWN_KEYS = new Set([
  prefix.MATRIX_SABLE_UNSTABLE_PROFILE_BIOGRAPHY_PROPERTY_NAME,
  prefix.MATRIX_COMMET_UNSTABLE_PROFILE_BIO_PROPERTY_NAME,
  prefix.MATRIX_UNSTABLE_PROFILE_BANNER_PROPERTY_NAME,
  prefix.MATRIX_COMMET_UNSTABLE_PROFILE_STATUS_PROPERTY_NAME,
  prefix.MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME,
  prefix.MATRIX_UNSTABLE_PROFILE_TIMEZONE_PROPERTY_NAME,
  prefix.MATRIX_STABLE_PROFILE_TIMEZONE_PROPERTY_NAME,
  prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_PROPERTY_NAME,
  'avatar_url',
  'displayname',
  prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_IS_CAT_PROPERTY_NAME,
  prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_HAS_CAT_PROPERTY_NAME,
]);

type UserExtendedSectionProps = {
  profile: UserProfile;
  htmlReactParserOptions: HTMLReactParserOptions;
  linkifyOpts: LinkifyOpts;
  innerColor?: string;
  cardColor?: string;
  textColor?: string;
};

const renderValue = (val: unknown) => {
  if (val === null || val === undefined) return 'n/a';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val as string | number | boolean);
};

function UserExtendedSection({
  profile,
  htmlReactParserOptions,
  linkifyOpts,
  innerColor,
  cardColor,
  textColor,
}: Readonly<UserExtendedSectionProps>) {
  const [showMisc, setShowMisc] = useState(false);
  const [miscDataIndex, setMiscDataIndex] = useState(-1);

  const [renderAnimals] = useSetting(settingsAtom, 'renderAnimals');
  const isCat = profile.isCat === true;
  const hasCats = profile.hasCats === true;

  const catStatusText = useMemo(() => {
    if (!renderAnimals) return null;
    if (isCat && hasCats) return 'Cat with cats—needs pets & love!';
    if (isCat) return 'Is a cat—give pets & love!';
    if (hasCats) return 'Has cats—send love!';
    return null;
  }, [renderAnimals, isCat, hasCats]);

  const languageFilterEnabled = getSettings().filterPronounsBasedOnLanguage ?? false;
  const languagesToFilterFor = getSettings().filterPronounsLanguages ?? ['en'];

  const pronouns = filterPronounsByLanguage(
    profile.pronouns,
    languageFilterEnabled,
    languagesToFilterFor
  )
    .map((p) => p.summary)
    .join(', ');
  const localTime = useMemo(() => {
    if (!profile.timezone) return null;

    try {
      return new Intl.DateTimeFormat([], {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: profile.timezone.replaceAll(/^["']|["']$/g, ''),
      }).format(new Date());
    } catch {
      return null;
    }
  }, [profile.timezone]);

  const bioContent = useMemo(() => {
    let rawBio =
      profile.extended?.[prefix.MATRIX_SABLE_UNSTABLE_PROFILE_BIOGRAPHY_PROPERTY_NAME] ||
      profile.extended?.[prefix.MATRIX_COMMET_UNSTABLE_PROFILE_BIO_PROPERTY_NAME] ||
      profile.bio;

    if (!rawBio) return null;

    if (typeof rawBio === 'object' && rawBio !== null && 'formatted_body' in rawBio) {
      rawBio = (rawBio as { formatted_body: string }).formatted_body;
    }

    if (typeof rawBio !== 'string') {
      return null;
    }

    const safetyTrim = rawBio.length > 2048 ? rawBio.slice(0, 2048) : rawBio;

    const visibleText = safetyTrim.replaceAll(/<[^>]*>?/gm, '');
    const VISIBLE_LIMIT = 1024;

    if (visibleText.length <= VISIBLE_LIMIT) {
      return safetyTrim;
    }

    return `${safetyTrim.slice(0, VISIBLE_LIMIT)}...`;
  }, [profile]);

  const unknownFields = Object.entries(profile.extended || {}).filter(
    ([key]) => !KNOWN_KEYS.has(key)
  );
  const selectedUnknownField = miscDataIndex > -1 ? unknownFields[miscDataIndex] : undefined;

  function handleMiscSelector(index: number) {
    setMiscDataIndex(index);
    setShowMisc(false);
  }

  const miscSelector = useMemo(() => {
    if (unknownFields.length === 1 && showMisc) {
      setShowMisc(false);
      setMiscDataIndex(miscDataIndex === -1 ? 0 : -1);
      return null;
    }
    return (
      <Menu
        style={{
          position: 'absolute',
          zIndex: '100',
          transform: `translateY(${toRem(32)})`,
          backgroundColor: innerColor,
        }}
      >
        <MenuItem
          size="300"
          radii="300"
          fill="None"
          style={{
            justifyContent: 'Center',
            textAlign: 'center',
            backgroundColor: cardColor,
            color: textColor,
          }}
          onClick={() => handleMiscSelector(-1)}
        >
          <Icon src={Icons.ChevronTop} size="50" />
          <Text>Show less</Text>
        </MenuItem>
        {unknownFields.map(([key], index) => (
          <MenuItem
            key={key}
            size="300"
            radii="300"
            fill="None"
            style={{ justifyContent: 'Center', backgroundColor: cardColor, color: textColor }}
            onClick={() => handleMiscSelector(index)}
          >
            <Text>{key}</Text>
          </MenuItem>
        ))}
      </Menu>
    );
  }, [cardColor, innerColor, miscDataIndex, showMisc, textColor, unknownFields]);
  const miscHeader = useMemo(
    () => (
      <Box justifyContent="Center" grow="Yes">
        <Button
          fill="None"
          size="300"
          className={css.MiscDataToggleButton}
          onClick={() => setShowMisc(!showMisc)}
          after={
            <Icon size="50" src={miscDataIndex === -1 ? Icons.ChevronBottom : Icons.ChevronTop} />
          }
          style={{
            padding: '1rem',
            justifyContent: 'flex-start',
            width: 'fit-content',
            textAlign: 'center',
            color: textColor,
          }}
        >
          <Text size="T200" priority="400">
            {miscDataIndex === -1
              ? `Show Misc. Data (${unknownFields.length} value${unknownFields.length > 1 ? 's' : ''})`
              : `${selectedUnknownField?.[0] ?? 'Unknown'} ${unknownFields.length > 1 ? `(${miscDataIndex + 1}/${unknownFields.length})` : ''}`}
          </Text>
        </Button>
        {showMisc && miscSelector}
      </Box>
    ),
    [miscSelector, miscDataIndex, selectedUnknownField, showMisc, unknownFields, textColor]
  );
  return (
    <Box direction="Column" gap="200" style={{ marginBottom: config.space.S100, color: textColor }}>
      {(pronouns || localTime) && (
        <Box alignItems="Center" gap="300" wrap="Wrap">
          {pronouns && (
            <Box alignItems="Center" gap="100">
              <Icon size="50" src={Icons.User} style={{ opacity: 0.5 }} />
              <Text size="T200" priority="400">
                {pronouns}
              </Text>
            </Box>
          )}
          {localTime && profile.timezone && (
            <Box alignItems="Center" gap="100">
              <Icon size="50" src={Icons.Clock} style={{ opacity: 0.5 }} />
              <Text size="T200" priority="400">
                {localTime} ({profile.timezone.replaceAll(/^["']|["']$/g, '')})
              </Text>
            </Box>
          )}
          {catStatusText && (
            <Box alignItems="Center" gap="100">
              <Icon size="50" src={Icons.Heart} style={{ opacity: 0.5 }} />
              <Text size="T200" priority="400">
                {catStatusText}
              </Text>
            </Box>
          )}
        </Box>
      )}

      {bioContent && (
        <Scroll
          data-profile-bio
          direction="Vertical"
          variant="SurfaceVariant"
          visibility="Always"
          size="300"
          style={{
            backgroundColor: cardColor,
            borderRadius: config.radii.R400,
            boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.1)',
            maxHeight: '200px',
            marginTop: config.space.S0,
            overflowY: 'auto',
          }}
        >
          <Box
            style={{
              padding: config.space.S200,
              wordBreak: 'break-word',
              backgroundColor: cardColor,
            }}
          >
            <Text size="T200" priority="400" as="div">
              <RenderBody
                body={bioContent}
                customBody={bioContent}
                htmlReactParserOptions={htmlReactParserOptions}
                linkifyOpts={linkifyOpts}
              />
            </Text>
          </Box>
        </Scroll>
      )}

      {unknownFields.length > 0 && (
        <Box direction="Column" gap="100">
          {miscDataIndex === -1 && miscHeader}
          {miscDataIndex > -1 && (
            <div
              style={{
                backgroundColor: cardColor,
                borderRadius: config.radii.R400,
                boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.1)',
                overflow: 'hidden',
              }}
            >
              <Box direction="Row" justifyContent="Center" alignContent="Center">
                {unknownFields.length > 1 && (
                  <Button
                    size="300"
                    fill="None"
                    className={css.MiscDataToggleButton}
                    onClick={() =>
                      setMiscDataIndex(
                        miscDataIndex === 0 ? unknownFields.length - 1 : miscDataIndex - 1
                      )
                    }
                    style={{ color: textColor }}
                  >
                    <Icon src={Icons.ArrowLeft} size="50" />
                  </Button>
                )}
                {miscHeader}
                {unknownFields.length > 1 && (
                  <Button
                    size="300"
                    fill="None"
                    className={css.MiscDataToggleButton}
                    onClick={() => setMiscDataIndex((miscDataIndex + 1) % unknownFields.length)}
                    style={{ color: textColor }}
                  >
                    <Icon src={Icons.ArrowRight} size="50" />
                  </Button>
                )}
              </Box>
              <Scroll
                size="300"
                direction="Both"
                visibility="Hover"
                hideTrack
                variant="SurfaceVariant"
                style={{
                  backgroundColor: color.SurfaceVariant.Container,
                  color: color.SurfaceVariant.OnContainer,
                  fontFamily: 'monospace',
                  boxShadow:
                    'inset 0 2px 0 rgba(0, 0, 0, 0.65), inset 0 4px 6px -2px rgba(0, 0, 0, 0.35)',
                }}
              >
                <Box
                  direction="Column"
                  style={{
                    padding: config.space.S200,
                    maxHeight: toRem(100),
                  }}
                >
                  <TextViewerContent
                    text={renderValue(selectedUnknownField?.[1])}
                    langName="json"
                  />
                </Box>
              </Scroll>
            </div>
          )}
        </Box>
      )}
    </Box>
  );
}

type UserRoomProfileProps = {
  userId: string;
  initialProfile?: Partial<UserProfile>;
};
export function UserRoomProfile({ userId, initialProfile }: Readonly<UserRoomProfileProps>) {
  const theme = useTheme();
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const navigate = useNavigate();
  const closeUserRoomProfile = useCloseUserRoomProfile();
  const ignoredUsers = useIgnoredUsers();
  const ignored = ignoredUsers.includes(userId);

  const [autoplayGifs] = useSetting(settingsAtom, 'autoplayGifs');

  const room = useRoom();
  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const { hasMorePower } = useMemberPowerCompare(creators, powerLevels);

  const myUserId = mx.getSafeUserId();
  const creator = creators.has(userId);

  const canKickUser = permissions.action('kick', myUserId) && hasMorePower(myUserId, userId);
  const canBanUser = permissions.action('ban', myUserId) && hasMorePower(myUserId, userId);
  const canUnban = permissions.action('ban', myUserId);
  const canInvite = permissions.action('invite', myUserId);

  const member = room.getMember(userId);
  const membership = useMembership(room, userId);
  const bannedMembership: string = KnownMembership.Ban;
  const invitedMembership: string = KnownMembership.Invite;
  const joinedMembership: string = KnownMembership.Join;
  const leftMembership: string = KnownMembership.Leave;

  const server = getMxIdServer(userId);
  const nicknames = useAtomValue(nicknamesAtom);
  const displayName = getMemberDisplayName(room, userId, nicknames);
  const avatarMxc = getMemberAvatarMxc(room, userId);
  const avatarUrl = (avatarMxc && mxcUrlToHttp(mx, avatarMxc, useAuthentication)) ?? undefined;

  const presence = useUserPresence(userId);

  const fetchedProfile = useUserProfile(userId, room);
  const extendedProfile =
    fetchedProfile && Object.keys(fetchedProfile).length > 0
      ? fetchedProfile
      : (initialProfile as UserProfile) || fetchedProfile;

  const parsedBanner =
    typeof extendedProfile.bannerUrl === 'string'
      ? extendedProfile.bannerUrl.replaceAll(/^"|"$/g, '')
      : undefined;

  const bannerHttpUrl = parsedBanner
    ? (mxcUrlToHttp(mx, parsedBanner, useAuthentication) ?? undefined)
    : undefined;

  const handleMessage = () => {
    closeUserRoomProfile();
    const directSearchParam: DirectCreateSearchParams = {
      userId,
    };
    navigate(withSearchParam(getDirectCreatePath(), directSearchParam));
  };

  // Todo eventually maybe
  const mentionClickHandler = useCallback((e: SyntheticEvent<HTMLElement>) => {
    e.preventDefault();
  }, []);
  const settingsLinkBaseUrl = useSettingsLinkBaseUrl();

  const linkifyOpts = useMemo<LinkifyOpts>(
    () => ({
      ...LINKIFY_OPTS,
      render: factoryRenderLinkifyWithMention(
        settingsLinkBaseUrl,
        (href) =>
          renderMatrixMention(
            mx,
            room.roomId,
            href,
            makeMentionCustomProps(mentionClickHandler),
            nicknames
          ),
        mentionClickHandler
      ),
    }),
    [mx, room, mentionClickHandler, nicknames, settingsLinkBaseUrl]
  );

  const spoilerClickHandler = useSpoilerClickHandler();

  const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
    () =>
      getReactCustomHtmlParser(mx, room.roomId, {
        settingsLinkBaseUrl,
        linkifyOpts,
        useAuthentication,
        handleSpoilerClick: spoilerClickHandler,
      }),
    [mx, room, linkifyOpts, settingsLinkBaseUrl, useAuthentication, spoilerClickHandler]
  );

  const backgroundColor = fetchedProfile.heroColor ?? color.Surface.Container;
  const fetchedBrightness = fetchedProfile?.heroBrightness;
  const isBackgroundDark = fetchedBrightness ? fetchedBrightness === 'dark' : undefined;
  const innerColor = shadeColor(backgroundColor, isBackgroundDark ? -50 : 50);
  const cardColor =
    shadeColor(backgroundColor, isBackgroundDark ? -80 : 80) ?? color.Background.Container;
  const textColor =
    ((fetchedBrightness === 'dark' || areColorsTooSimilar('#000000', innerColor)) && '#FFFFFF') ||
    ((fetchedBrightness === 'light' || areColorsTooSimilar('#FFFFFF', innerColor)) && '#000000') ||
    undefined;

  const showCustomHeroCard = !!fetchedProfile.heroColor;

  const chipFillColor =
    shadeColor(innerColor, fetchedBrightness === 'light' ? -14 : 32) ?? cardColor;
  const chipHoverBrightness =
    fetchedBrightness === 'light'
      ? 0.94
      : fetchedBrightness === 'dark'
        ? 1.12
        : theme.kind === ThemeKind.Dark
          ? 1.12
          : 0.94;
  const chipSurfaceStyle: CSSProperties | undefined =
    showCustomHeroCard && chipFillColor
      ? ({
          backgroundColor: chipFillColor,
          borderColor: 'transparent',
          color: textColor,
          '--user-hero-chip-hover-brightness': chipHoverBrightness,
        } as CSSProperties)
      : undefined;

  const chipMenuTextColor = textColor ?? color.Surface.OnContainer;
  const chipColors = showCustomHeroCard
    ? {
        innerColor,
        cardColor,
        textColor: chipMenuTextColor,
        chipSurfaceStyle,
        chipFillColor,
        chipHoverBrightness,
      }
    : {
        innerColor: color.Surface.Container,
        chipFillColor: color.SurfaceVariant.Container,
        textColor: color.SurfaceVariant.OnContainer,
        chipHoverBrightness,
      };

  return (
    <Box direction="Column" style={{ color: textColor }}>
      <UserHero
        userId={userId}
        avatarUrl={avatarUrl}
        bannerUrl={bannerHttpUrl ?? undefined}
        presence={presence && presence.lastActiveTs !== 0 ? presence : undefined}
        autoplayGifs={autoplayGifs}
      />
      <Box
        direction="Column"
        gap="300"
        style={{
          padding: showCustomHeroCard && innerColor ? config.space.S200 : config.space.S0,
          backgroundColor,
        }}
      >
        <Box
          direction="Column"
          gap="200"
          style={{
            backgroundColor: innerColor,
            borderRadius: toRem(5),
            boxShadow: showCustomHeroCard ? 'inset 0 1px 2px rgba(0, 0, 0, 0.1)' : undefined,
            padding: showCustomHeroCard && innerColor ? config.space.S200 : config.space.S300,
          }}
        >
          <Box gap="200" alignItems="Center" wrap="Wrap">
            <UserHeroName
              displayName={displayName}
              userId={userId}
              customHeroCards={showCustomHeroCard}
            />
            {userId !== myUserId && (
              <Button
                size="300"
                variant="Primary"
                fill="Solid"
                radii="300"
                before={<Icon size="50" src={Icons.Message} filled />}
                onClick={handleMessage}
                className={showCustomHeroCard ? css.UserHeroChipThemed : css.UserHeroChip}
                style={{
                  marginLeft: 'auto',
                  ...(showCustomHeroCard && chipSurfaceStyle ? chipSurfaceStyle : {}),
                  ...heroMenuItemStyle({}, chipHoverBrightness),
                }}
              >
                <Text size="B300">Message</Text>
              </Button>
            )}
          </Box>
          <UserExtendedSection
            profile={extendedProfile}
            htmlReactParserOptions={htmlReactParserOptions}
            linkifyOpts={linkifyOpts}
            innerColor={innerColor}
            cardColor={cardColor}
            textColor={textColor}
          />
          <Box alignItems="Center" gap="100" wrap="Wrap" justifyContent="Center">
            {server && <ServerChip server={server} {...chipColors} />}
            <ShareChip userId={userId} {...chipColors} />
            {creator ? (
              <CreatorChip {...chipColors} />
            ) : (
              <PowerChip userId={userId} {...chipColors} />
            )}
            {userId !== myUserId && <MutualRoomsChip userId={userId} {...chipColors} />}
            {userId !== myUserId && <OptionsChip userId={userId} {...chipColors} />}
          </Box>
          {ignored && <IgnoredUserAlert />}
          {member && membership === bannedMembership && (
            <UserBanAlert
              userId={userId}
              reason={member.events.member?.getContent().reason}
              canUnban={canUnban}
              bannedBy={member.events.member?.getSender()}
              ts={member.events.member?.getTs()}
            />
          )}
          {member &&
            membership === leftMembership &&
            member.events.member &&
            member.events.member.getSender() !== userId && (
              <UserKickAlert
                reason={member.events.member?.getContent().reason}
                kickedBy={member.events.member?.getSender()}
                ts={member.events.member?.getTs()}
              />
            )}
          {member && membership === invitedMembership && (
            <UserInviteAlert
              userId={userId}
              reason={member.events.member?.getContent().reason}
              canKick={canKickUser}
              invitedBy={member.events.member?.getSender()}
              ts={member.events.member?.getTs()}
            />
          )}
          <UserModeration
            userId={userId}
            canInvite={canInvite && membership === leftMembership}
            canKick={canKickUser && membership === joinedMembership}
            canBan={canBanUser && membership !== bannedMembership}
          />
        </Box>
      </Box>
    </Box>
  );
}
