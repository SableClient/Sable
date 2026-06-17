import type { MouseEventHandler } from 'react';
import { useMemo } from 'react';
import type { IEventWithRoomId, Room } from '$types/matrix-sdk';
import { JoinRule, RelationType, EventType } from '$types/matrix-sdk';
import type { IImageContent } from '$types/matrix/common';
import type { HTMLReactParserOptions } from 'html-react-parser';
import { Avatar, Box, Chip, Text, config } from 'folds';
import type { Opts as LinkifyOpts } from 'linkifyjs';
import { useMatrixClient } from '$hooks/useMatrixClient';
import {
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  makeHighlightRegex,
  makeMentionCustomProps,
  renderMatrixMention,
} from '$plugins/react-custom-html-parser';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { useMatrixEventRenderer } from '$hooks/useMatrixEventRenderer';
import type { GetContentCallback } from '$types/matrix/room';

import {
  AvatarBase,
  ImageContent,
  MSticker,
  ModernLayout,
  RedactedContent,
  Reply,
  Time,
  Username,
  UsernameBold,
} from '$components/message';
import { RenderMessageContent } from '$components/RenderMessageContent';
import { Image } from '$components/media';
import { ImageViewer } from '$components/image-viewer';
import * as customHtmlCss from '$styles/CustomHtml.css';
import { RoomAvatar, RoomIcon } from '$components/room-avatar';
import { getMemberAvatarMxc, getMemberDisplayName, getRoomAvatarUrl } from '$utils/room';
import { useAtomValue } from 'jotai';
import { nicknamesAtom } from '$state/nicknames';
import { SequenceCard } from '$components/sequence-card';
import { UserAvatar } from '$components/user-avatar';
import { useMentionClickHandler } from '$hooks/useMentionClickHandler';
import { useSpoilerClickHandler } from '$hooks/useSpoilerClickHandler';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { usePowerLevels } from '$hooks/usePowerLevels';
import { usePowerLevelTags } from '$hooks/usePowerLevelTags';
import { useTheme } from '$hooks/useTheme';
import { PowerIcon } from '$components/power';
import colorMXID from '$utils/colorMXID';
import {
  getPowerTagIconSrc,
  useAccessiblePowerTagColors,
  useGetMemberPowerTag,
} from '$hooks/useMemberPowerTag';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomCreatorsTag } from '$hooks/useRoomCreatorsTag';
import { useSettingsLinkBaseUrl } from '$features/settings/useSettingsLinkBaseUrl';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import type { ResultItem } from './useMessageSearch';
import { Icon, Icons } from '$app/icons';

type SearchResultMessageRendererDeps = {
  mediaAutoLoad?: boolean;
  urlPreview?: boolean;
  htmlReactParserOptions: HTMLReactParserOptions;
  linkifyOpts: LinkifyOpts;
  highlightRegex?: RegExp;
};

type SearchResultReactionRendererDeps = {
  mediaAutoLoad?: boolean;
};

function renderSearchResultRoomMessage(
  deps: SearchResultMessageRendererDeps,
  event: IEventWithRoomId,
  displayName: string,
  getContent: GetContentCallback
) {
  if (event.unsigned?.redacted_because) {
    return <RedactedContent reason={event.unsigned?.redacted_because.content.reason} />;
  }

  return (
    <RenderMessageContent
      displayName={displayName}
      msgType={event.content.msgtype ?? ''}
      ts={event.origin_server_ts}
      getContent={getContent}
      mediaAutoLoad={deps.mediaAutoLoad}
      urlPreview={deps.urlPreview}
      htmlReactParserOptions={deps.htmlReactParserOptions}
      linkifyOpts={deps.linkifyOpts}
      highlightRegex={deps.highlightRegex}
      outlineAttachment
    />
  );
}

function renderSearchResultReactionContent(
  deps: SearchResultReactionRendererDeps,
  props: Parameters<NonNullable<React.ComponentProps<typeof MSticker>['renderImageContent']>>[0]
) {
  return (
    <ImageContent
      {...props}
      autoPlay={deps.mediaAutoLoad}
      renderImage={renderSearchResultImage}
      renderViewer={renderSearchResultImageViewer}
    />
  );
}

function renderSearchResultReaction(
  deps: SearchResultReactionRendererDeps,
  event: IEventWithRoomId,
  _displayName: string,
  getContent: GetContentCallback
) {
  if (event.unsigned?.redacted_because) {
    return <RedactedContent reason={event.unsigned?.redacted_because.content.reason} />;
  }
  return (
    <MSticker
      content={getContent() as IImageContent}
      renderImageContent={renderSearchResultReactionContent.bind(null, deps)}
    />
  );
}

function renderSearchResultTombstone(event: IEventWithRoomId) {
  const { content } = event;
  return (
    <Box grow="Yes" direction="Column">
      <Text size="T400" priority="300">
        Room Tombstone. {content.body}
      </Text>
    </Box>
  );
}

function renderSearchResultFallback(event: IEventWithRoomId) {
  if (event.unsigned?.redacted_because) {
    return <RedactedContent reason={event.unsigned?.redacted_because.content.reason} />;
  }
  return (
    <Box grow="Yes" direction="Column">
      <Text size="T400" priority="300">
        <code className={customHtmlCss.Code}>{event.type}</code>
        {' event'}
      </Text>
    </Box>
  );
}

function renderSearchResultImage(props: React.ComponentProps<typeof Image>) {
  return <Image {...props} loading="lazy" />;
}

function renderSearchResultImageViewer(props: React.ComponentProps<typeof ImageViewer>) {
  return <ImageViewer {...props} />;
}

type SearchResultTimelineItemProps = {
  room: Room;
  item: ResultItem;
  highlights: string[];
  mediaAutoLoad?: boolean;
  urlPreview?: boolean;
  onOpen: (roomId: string, eventId: string) => void;
  legacyUsernameColor?: boolean;
  hour24Clock: boolean;
  dateFormatString: string;
};

/**
 * Renders a single search result in ungrouped timeline view.
 * Shows the room context inline with each result.
 */
export function SearchResultTimelineItem({
  room,
  item,
  highlights,
  mediaAutoLoad,
  urlPreview,
  onOpen,
  legacyUsernameColor,
  hour24Clock,
  dateFormatString,
}: SearchResultTimelineItemProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const highlightRegex = useMemo(() => makeHighlightRegex(highlights), [highlights]);

  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);

  const creatorsTag = useRoomCreatorsTag();
  const powerLevelTags = usePowerLevelTags(room, powerLevels);
  const getMemberPowerTag = useGetMemberPowerTag(room, creators, powerLevels);

  const theme = useTheme();
  const accessibleTagColors = useAccessiblePowerTagColors(theme.kind, creatorsTag, powerLevelTags);
  const nicknames = useAtomValue(nicknamesAtom);
  const settingsLinkBaseUrl = useSettingsLinkBaseUrl();
  const [incomingInlineImagesDefaultHeight] = useSetting(
    settingsAtom,
    'incomingInlineImagesDefaultHeight'
  );
  const [incomingInlineImagesMaxHeight] = useSetting(settingsAtom, 'incomingInlineImagesMaxHeight');

  const mentionClickHandler = useMentionClickHandler(room.roomId);
  const spoilerClickHandler = useSpoilerClickHandler();

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
  const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
    () =>
      getReactCustomHtmlParser(mx, room.roomId, {
        settingsLinkBaseUrl,
        linkifyOpts,
        highlightRegex,
        useAuthentication,
        handleSpoilerClick: spoilerClickHandler,
        handleMentionClick: mentionClickHandler,
        nicknames,
        incomingInlineImagesDefaultHeight,
        incomingInlineImagesMaxHeight,
      }),
    [
      mx,
      room,
      linkifyOpts,
      highlightRegex,
      mentionClickHandler,
      spoilerClickHandler,
      useAuthentication,
      nicknames,
      settingsLinkBaseUrl,
      incomingInlineImagesDefaultHeight,
      incomingInlineImagesMaxHeight,
    ]
  );

  const roomMessageRendererDeps = useMemo<SearchResultMessageRendererDeps>(
    () => ({
      mediaAutoLoad,
      urlPreview,
      htmlReactParserOptions,
      linkifyOpts,
      highlightRegex,
    }),
    [mediaAutoLoad, urlPreview, htmlReactParserOptions, linkifyOpts, highlightRegex]
  );
  const reactionRendererDeps = useMemo<SearchResultReactionRendererDeps>(
    () => ({ mediaAutoLoad }),
    [mediaAutoLoad]
  );
  const roomMessageRenderer = useMemo(
    () => renderSearchResultRoomMessage.bind(null, roomMessageRendererDeps),
    [roomMessageRendererDeps]
  );
  const reactionRenderer = useMemo(
    () => renderSearchResultReaction.bind(null, reactionRendererDeps),
    [reactionRendererDeps]
  );

  const renderMatrixEvent = useMatrixEventRenderer<[IEventWithRoomId, string, GetContentCallback]>(
    {
      [EventType.RoomMessage]: roomMessageRenderer,
      [EventType.Reaction]: reactionRenderer,
      [EventType.RoomTombstone]: renderSearchResultTombstone,
    },
    undefined,
    renderSearchResultFallback
  );

  const handleOpenClick: MouseEventHandler = (evt) => {
    const eventId = evt.currentTarget.getAttribute('data-event-id');
    if (!eventId) return;
    onOpen(room.roomId, eventId);
  };

  const { event } = item;

  const displayName =
    getMemberDisplayName(room, event.sender, nicknames) ??
    getMxIdLocalPart(event.sender) ??
    event.sender;
  const senderAvatarMxc = getMemberAvatarMxc(room, event.sender);

  const relation = event.content['m.relates_to'];
  const mainEventId =
    relation?.rel_type === RelationType.Replace ? relation.event_id : event.event_id;

  const getContent = (() => event.content['m.new_content'] ?? event.content) as GetContentCallback;

  const replyEventId = relation?.['m.in_reply_to']?.event_id;
  const threadRootId = relation?.rel_type === RelationType.Thread ? relation.event_id : undefined;

  const memberPowerTag = getMemberPowerTag(event.sender);
  const tagColor = memberPowerTag?.color
    ? accessibleTagColors?.get(memberPowerTag.color)
    : undefined;
  const tagIconSrc = memberPowerTag?.icon
    ? getPowerTagIconSrc(mx, useAuthentication, memberPowerTag.icon)
    : undefined;

  const usernameColor = legacyUsernameColor ? colorMXID(event.sender) : tagColor;

  return (
    <SequenceCard
      key={event.event_id}
      style={{ padding: config.space.S400 }}
      variant="SurfaceVariant"
      direction="Column"
      gap="200"
    >
      {/* Room header chip */}
      <Box gap="200" alignItems="Center">
        <Avatar size="200" radii="300">
          <RoomAvatar
            roomId={room.roomId}
            src={getRoomAvatarUrl(mx, room, 96, useAuthentication)}
            alt={room.name}
            renderFallback={() => (
              <RoomIcon
                size="50"
                roomType={room.getType()}
                joinRule={room.getJoinRule() ?? JoinRule.Restricted}
                filled
              />
            )}
          />
        </Avatar>
        <Text size="T400" truncate>
          {room.name}
        </Text>
      </Box>

      {/* Message content */}
      <ModernLayout
        before={
          <AvatarBase>
            <Avatar size="300">
              <UserAvatar
                userId={event.sender}
                src={
                  senderAvatarMxc
                    ? (mxcUrlToHttp(mx, senderAvatarMxc, useAuthentication, 48, 48, 'crop') ??
                      undefined)
                    : undefined
                }
                alt={displayName}
                renderFallback={() => <Icon size="200" src={Icons.User} filled />}
              />
            </Avatar>
          </AvatarBase>
        }
      >
        <Box gap="300" justifyContent="SpaceBetween" alignItems="Center" grow="Yes">
          <Box gap="200" alignItems="Baseline">
            <Box alignItems="Center" gap="200">
              <Username style={{ color: usernameColor }}>
                <Text as="span" truncate>
                  <UsernameBold>{displayName}</UsernameBold>
                </Text>
              </Username>
              {tagIconSrc && <PowerIcon size="100" iconSrc={tagIconSrc} />}
            </Box>
            <Time
              ts={event.origin_server_ts}
              hour24Clock={hour24Clock}
              dateFormatString={dateFormatString}
            />
          </Box>
          <Box shrink="No" gap="200" alignItems="Center">
            <Chip
              data-event-id={mainEventId}
              onClick={handleOpenClick}
              variant="Secondary"
              radii="400"
            >
              <Text size="T200">Open</Text>
            </Chip>
          </Box>
        </Box>
        {replyEventId && (
          <Reply
            room={room}
            replyEventId={replyEventId}
            threadRootId={threadRootId}
            mentions={event.content['m.mentions']}
            onClick={handleOpenClick}
          />
        )}
        {renderMatrixEvent(event.type, false, event, displayName, getContent)}
      </ModernLayout>
    </SequenceCard>
  );
}
