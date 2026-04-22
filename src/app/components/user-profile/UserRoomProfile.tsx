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
import { SyntheticEvent, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { Opts as LinkifyOpts } from 'linkifyjs';
import { HTMLReactParserOptions } from 'html-react-parser';
import { getMxIdServer, mxcUrlToHttp } from '$utils/matrix';
import { getMemberAvatarMxc, getMemberDisplayName } from '$utils/room';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { usePowerLevels } from '$hooks/usePowerLevels';
import { useRoom } from '$hooks/useRoom';
import { useUserPresence } from '$hooks/useUserPresence';
import { useCloseUserRoomProfile } from '$state/hooks/userRoomProfile';
import { useIgnoredUsers } from '$hooks/useIgnoredUsers';
import { useMembership } from '$hooks/useMembership';
import { Membership } from '$types/matrix/room';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { useMemberPowerCompare } from '$hooks/useMemberPowerCompare';
import { getDirectCreatePath, withSearchParam } from '$pages/pathUtils';
import { DirectCreateSearchParams } from '$pages/paths';
import { nicknamesAtom } from '$state/nicknames';
import { UserProfile, useUserProfile } from '$hooks/useUserProfile';
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
import { TextViewerContent } from '$components/text-viewer';
import { shadeColor } from '$utils/shadeColor';
import { CreatorChip } from './CreatorChip';
import { UserInviteAlert, UserBanAlert, UserModeration, UserKickAlert } from './UserModeration';
import { PowerChip } from './PowerChip';
import { IgnoredUserAlert, MutualRoomsChip, OptionsChip, ServerChip, ShareChip } from './UserChips';
import { UserHero, UserHeroName } from './UserHero';

const KNOWN_KEYS = [
  'moe.sable.app.bio',
  'chat.commet.profile_bio',
  'chat.commet.profile_banner',
  'chat.commet.profile_status',
  'io.fsky.nyx.pronouns',
  'us.cloke.msc4175.tz',
  'm.tz',
  'moe.sable.app.name_color',
  'avatar_url',
  'displayname',
  'kitty.meow.has_cats',
  'kitty.meow.is_cat',
];

type UserExtendedSectionProps = {
  profile: UserProfile;
  htmlReactParserOptions: HTMLReactParserOptions;
  linkifyOpts: LinkifyOpts;
  backgroundColor?: string;
  innerColor?: string;
  cardColor?: string;
  textColor?: string;
};

function UserExtendedSection({
  profile,
  htmlReactParserOptions,
  linkifyOpts,
  backgroundColor,
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

  const renderValue = (val: any) => {
    if (val === null || val === undefined) return 'n/a';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

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
      profile.extended?.['moe.sable.app.bio'] ||
      profile.extended?.['chat.commet.profile_bio'] ||
      profile.bio;

    if (!rawBio) return null;

    if (typeof rawBio === 'object' && rawBio !== null && 'formatted_body' in rawBio) {
      rawBio = rawBio.formatted_body;
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
    ([key]) => !KNOWN_KEYS.includes(key)
  );

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
          variant="Secondary"
          size="300"
          fill="None"
          onClick={() => setShowMisc(!showMisc)}
          after={miscDataIndex === -1 && <Icon size="50" src={Icons.ChevronBottom} />}
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
              : `${unknownFields[miscDataIndex][0]} ${unknownFields.length > 1 ? `(${miscDataIndex + 1}/${unknownFields.length})` : ''}`}
          </Text>
        </Button>
        {showMisc && miscSelector}
      </Box>
    ),
    [miscDataIndex, textColor, unknownFields, showMisc, miscSelector]
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
            borderColor: backgroundColor,
            borderStyle: 'solid',
            borderWidth: '1px',
            maxHeight: '200px',
            marginTop: config.space.S0,
            overflowY: 'auto',
          }}
        >
          <Box style={{ padding: config.space.S200, wordBreak: 'break-word' }}>
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
                border: '2px solid',
                backgroundColor: cardColor,
                borderColor: 'var(--sable-surface-container-line)',
                borderRadius: config.radii.R400,
                borderWidth: '1px',
              }}
            >
              <Box
                direction="Row"
                justifyContent="Center"
                alignContent="Center"
                style={{
                  borderRadius: config.radii.R400,
                }}
              >
                {unknownFields.length > 1 && (
                  <Button
                    size="300"
                    fill="None"
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
                style={{
                  backgroundColor: color.Background.Container,
                  color: color.Background.OnContainer,
                }}
              >
                <Box
                  direction="Column"
                  style={{
                    padding: config.space.S200,
                    borderRadius: config.radii.R400,
                    maxHeight: toRem(100),
                  }}
                >
                  <TextViewerContent
                    text={renderValue(unknownFields[miscDataIndex][1])}
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
    (fetchedBrightness === 'dark' && '#FFFFFF') ||
    (fetchedBrightness === 'light' && '#000000') ||
    undefined;

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
          padding: config.space.S200,
          backgroundColor,
        }}
      >
        <Box
          direction="Column"
          gap="200"
          style={{
            backgroundColor: innerColor,
            borderRadius: toRem(5),
            borderWidth: toRem(5),
            borderColor: '#00000000',
            borderStyle: 'solid',
            padding: config.space.S200,
          }}
        >
          <Box gap="200" alignItems="Center" wrap="Wrap">
            <UserHeroName displayName={displayName} userId={userId} />
            {userId !== myUserId && (
              <Button
                size="300"
                variant="Primary"
                fill="Solid"
                radii="300"
                before={<Icon size="50" src={Icons.Message} filled />}
                onClick={handleMessage}
                style={{
                  marginLeft: 'auto',
                  backgroundColor:
                    backgroundColor !== color.Surface.Container ? cardColor : undefined,
                  borderColor: backgroundColor,
                  color: backgroundColor !== color.Surface.Container ? textColor : undefined,
                  borderStyle: 'solid',
                  borderWidth: '1px',
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
            backgroundColor={backgroundColor}
            innerColor={innerColor}
            cardColor={cardColor}
            textColor={textColor}
          />
          <Box alignItems="Center" gap="100" wrap="Wrap" justifyContent="Center">
            {server && (
              <ServerChip
                server={server}
                backgroundColor={backgroundColor}
                innerColor={innerColor}
                cardColor={cardColor}
                textColor={textColor}
              />
            )}
            <ShareChip
              userId={userId}
              backgroundColor={backgroundColor}
              innerColor={innerColor}
              cardColor={cardColor}
              textColor={textColor}
            />
            {creator ? (
              <CreatorChip />
            ) : (
              <PowerChip
                userId={userId}
                backgroundColor={backgroundColor}
                innerColor={innerColor}
                cardColor={cardColor}
                textColor={textColor}
              />
            )}
            {userId !== myUserId && (
              <MutualRoomsChip
                userId={userId}
                backgroundColor={backgroundColor}
                innerColor={innerColor}
                cardColor={cardColor}
                textColor={textColor}
              />
            )}
            {userId !== myUserId && (
              <OptionsChip
                userId={userId}
                backgroundColor={backgroundColor}
                innerColor={innerColor}
                cardColor={cardColor}
                textColor={textColor}
              />
            )}
          </Box>
        </Box>
        {ignored && <IgnoredUserAlert />}
        {member && membership === Membership.Ban && (
          <UserBanAlert
            userId={userId}
            reason={member.events.member?.getContent().reason}
            canUnban={canUnban}
            bannedBy={member.events.member?.getSender()}
            ts={member.events.member?.getTs()}
          />
        )}
        {member &&
          membership === Membership.Leave &&
          member.events.member &&
          member.events.member.getSender() !== userId && (
            <UserKickAlert
              reason={member.events.member?.getContent().reason}
              kickedBy={member.events.member?.getSender()}
              ts={member.events.member?.getTs()}
            />
          )}
        {member && membership === Membership.Invite && (
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
          canInvite={canInvite && membership === Membership.Leave}
          canKick={canKickUser && membership === Membership.Join}
          canBan={canBanUser && membership !== Membership.Ban}
        />
      </Box>
    </Box>
  );
}
