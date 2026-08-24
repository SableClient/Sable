import type { ComponentProps, MouseEventHandler, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { HTMLReactParserOptions } from 'html-react-parser';
import type { Opts as LinkifyOpts } from 'linkifyjs';
import { Avatar, Box, Text } from 'folds';
import type { IImageContent } from '$types/matrix/common';
import type { MatrixEvent, Room } from '$types/matrix-sdk';
import { EventType, MatrixEventEvent } from '$types/matrix-sdk';
import { M_POLL_START } from 'matrix-js-sdk';
import { useAtomValue } from 'jotai';
import {
  AvatarBase,
  ImageContent,
  MessageNotDecryptedContent,
  MessageUnsupportedContent,
  ModernLayout,
  MSticker,
  RedactedContent,
  Reply,
  Time,
  Username,
  UsernameBold,
  type RenderImageContentProps,
} from '$components/message';
import { UserAvatar } from '$components/user-avatar';
import { Image as MediaImage } from '$components/media';
import { ImageViewer } from '$components/image-viewer';
import { RenderMessageContent } from '$components/RenderMessageContent';
import { PowerIcon } from '$components/power';
import { userFallbackIcon } from '$components/icons/phosphor';
import { EncryptedContent, Pronouns } from '$features/room/message';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMatrixEventRenderer } from '$hooks/useMatrixEventRenderer';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useSableCosmetics } from '$hooks/useSableCosmetics';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { usePowerLevels } from '$hooks/usePowerLevels';
import { useGetMemberPowerTag, getPowerTagIconSrc } from '$hooks/useMemberPowerTag';
import { useUserProfile, type UserProfile } from '$hooks/useUserProfile';
import { useOpenUserRoomProfile } from '$state/hooks/userRoomProfile';
import type { PerMessageProfileBeeperFormat } from '$hooks/usePerMessageProfile';
import { convertBeeperFormatToOurPerMessageProfile } from '$hooks/usePerMessageProfile';
import { getParsedPronouns } from '$utils/pronouns';
import { useMentionClickHandler } from '$hooks/useMentionClickHandler';
import { useSpoilerClickHandler } from '$hooks/useSpoilerClickHandler';
import { useSettingsLinkBaseUrl } from '$features/settings/useSettingsLinkBaseUrl';
import {
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  makeMentionCustomProps,
  renderMatrixMention,
} from '$plugins/react-custom-html-parser';
import { nicknamesAtom } from '$state/nicknames';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import type { GetContentCallback } from '$types/matrix/room';
import { getMemberAvatarMxc, getMemberDisplayName } from '$utils/room/display';
import { getEditedEvent } from '$utils/room/relations';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import * as customHtmlCss from '$styles/CustomHtml.css';

type MessagePreviewRendererOptions = {
  room: Room;
  mediaAutoLoad?: boolean;
  bundledPreview?: boolean;
  urlPreview?: boolean;
  htmlReactParserOptions: HTMLReactParserOptions;
  linkifyOpts: LinkifyOpts;
};

type MessagePreviewRendererContext = MessagePreviewRendererOptions & {
  mx: ReturnType<typeof useMatrixClient>;
};

function LazyImage(props: ComponentProps<typeof MediaImage>) {
  return <MediaImage {...props} disablePixelation loading="lazy" />;
}

function resolvePreviewContent(
  room: Room,
  event: MatrixEvent,
  fallbackGetContent: GetContentCallback
) {
  const eventId = event.getId();
  const timeline = eventId ? room.getTimelineForEvent(eventId) : undefined;
  const editedEvent =
    eventId && timeline ? getEditedEvent(eventId, event, timeline.getTimelineSet()) : undefined;
  const fallbackContent = fallbackGetContent() as Record<string, unknown>;
  const editedContent = editedEvent?.getContent()?.['m.new_content'] as
    | Record<string, unknown>
    | undefined;

  return {
    content: editedContent ?? fallbackContent,
    edited: !!editedEvent || event.getContent()['m.new_content'] !== undefined,
  };
}

function renderStickerImageContent(
  mediaAutoLoad: boolean | undefined,
  props: RenderImageContentProps
) {
  return (
    <ImageContent
      {...props}
      autoPlay={mediaAutoLoad}
      renderImage={LazyImage}
      renderViewer={(viewerProps) => <ImageViewer {...viewerProps} />}
    />
  );
}

function renderRoomMessage(
  ctx: MessagePreviewRendererContext,
  event: MatrixEvent,
  displayName: string,
  getContent: GetContentCallback
) {
  if (event.isRedacted()) {
    return <RedactedContent reason={event.getUnsigned().redacted_because?.content.reason} />;
  }

  const resolved = resolvePreviewContent(ctx.room, event, getContent);
  const content = resolved.content as { msgtype?: string };
  const resolvedGetContent = (() => resolved.content) as GetContentCallback;
  return (
    <RenderMessageContent
      displayName={displayName}
      msgType={content.msgtype ?? ''}
      ts={event.getTs()}
      getContent={resolvedGetContent}
      edited={resolved.edited}
      mediaAutoLoad={ctx.mediaAutoLoad}
      bundledPreview={ctx.bundledPreview}
      urlPreview={ctx.urlPreview}
      htmlReactParserOptions={ctx.htmlReactParserOptions}
      linkifyOpts={ctx.linkifyOpts}
      outlineAttachment
      mEvent={event}
      mx={ctx.mx}
      room={ctx.room}
    />
  );
}

function renderEncryptedDecrypted(
  ctx: MessagePreviewRendererContext,
  event: MatrixEvent,
  displayName: string,
  decryptedEvent: MatrixEvent,
  eventTimeline: ReturnType<Room['getTimelineForEvent']>
) {
  const eventId = event.getId()!;
  if (decryptedEvent.isRedacted()) return <RedactedContent />;
  const decryptedType = decryptedEvent.getType();
  const stickerType: string = EventType.Sticker;
  const messageType: string = EventType.RoomMessage;
  const encryptedType: string = EventType.RoomMessageEncrypted;

  if (decryptedType === stickerType) {
    return (
      <MSticker
        content={decryptedEvent.getContent()}
        renderImageContent={renderStickerImageContent.bind(null, ctx.mediaAutoLoad)}
      />
    );
  }
  if (decryptedType === messageType) {
    const editedEvent = eventTimeline
      ? getEditedEvent(eventId, decryptedEvent, eventTimeline.getTimelineSet())
      : undefined;
    const getContent = (() =>
      editedEvent?.getContent()?.['m.new_content'] ??
      decryptedEvent.getContent()) as GetContentCallback;

    return renderRoomMessage(ctx, decryptedEvent, displayName, getContent);
  }
  if (decryptedType === encryptedType) {
    return (
      <Text>
        <MessageNotDecryptedContent />
      </Text>
    );
  }
  return (
    <Text>
      <MessageUnsupportedContent />
    </Text>
  );
}

function renderEncrypted(
  ctx: MessagePreviewRendererContext,
  event: MatrixEvent,
  displayName: string
) {
  const eventId = event.getId()!;
  const eventTimeline = ctx.room.getTimelineForEvent(eventId);
  // Previews are also rendered for events outside any loaded timeline (the
  // notification inbox), so fall back to the event we were handed.
  const decryptedEvent =
    eventTimeline?.getEvents().find((item) => item.getId() === eventId) ?? event;

  return (
    <EncryptedContent mEvent={decryptedEvent}>
      {renderEncryptedDecrypted.bind(null, ctx, event, displayName, decryptedEvent, eventTimeline)}
    </EncryptedContent>
  );
}

function renderSticker(
  ctx: MessagePreviewRendererContext,
  event: MatrixEvent,
  _displayName: string,
  getContent: GetContentCallback
) {
  if (event.isRedacted()) {
    return <RedactedContent reason={event.getUnsigned().redacted_because?.content.reason} />;
  }
  return (
    <MSticker
      content={getContent() as IImageContent}
      renderImageContent={renderStickerImageContent.bind(null, ctx.mediaAutoLoad)}
    />
  );
}

function renderFallback(_ctx: MessagePreviewRendererContext, event: MatrixEvent) {
  if (event.isRedacted()) {
    return <RedactedContent reason={event.getUnsigned().redacted_because?.content.reason} />;
  }
  return (
    <Box grow="Yes" direction="Column">
      <Text size="T400" priority="300">
        <code className={customHtmlCss.Code}>{event.getType()}</code>
        {' event'}
      </Text>
    </Box>
  );
}

function renderTombstone(_ctx: MessagePreviewRendererContext, event: MatrixEvent) {
  if (event.isRedacted()) {
    return <RedactedContent reason={event.getUnsigned().redacted_because?.content.reason} />;
  }

  return <Text>{event.getContent().body ?? 'This room has been replaced.'}</Text>;
}

function useMessagePreviewRenderer(options: MessagePreviewRendererOptions) {
  const mx = useMatrixClient();
  const context = useMemo<MessagePreviewRendererContext>(() => ({ ...options, mx }), [mx, options]);
  const handlers = useMemo(
    () => ({
      [EventType.RoomMessage]: renderRoomMessage.bind(null, context),
      [EventType.RoomMessageEncrypted]: renderEncrypted.bind(null, context),
      [EventType.Sticker]: renderSticker.bind(null, context),
      [EventType.RoomTombstone]: renderTombstone.bind(null, context),
      [M_POLL_START.name]: renderRoomMessage.bind(null, context),
    }),
    [context]
  );

  return useMatrixEventRenderer<[MatrixEvent, string, GetContentCallback]>(
    handlers,
    undefined,
    renderFallback.bind(null, context)
  );
}

type RoomMessagePreviewRendererOptions = {
  highlightRegex?: RegExp;
  settingsLinkBaseUrl?: string;
};

export function useRoomMessagePreviewRenderer(
  room: Room,
  options: RoomMessagePreviewRendererOptions = {}
) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const nicknames = useAtomValue(nicknamesAtom);
  const defaultSettingsLinkBaseUrl = useSettingsLinkBaseUrl();
  const settingsLinkBaseUrl = options.settingsLinkBaseUrl ?? defaultSettingsLinkBaseUrl;
  const mentionClickHandler = useMentionClickHandler(room.roomId);
  const spoilerClickHandler = useSpoilerClickHandler();
  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [bundledPreview] = useSetting(settingsAtom, 'bundledPreview');
  const [urlPreview] = useSetting(settingsAtom, 'urlPreview');
  const [encUrlPreview] = useSetting(settingsAtom, 'encUrlPreview');
  const [autoplayEmojis] = useSetting(settingsAtom, 'autoplayEmojis');
  const [incomingInlineImagesDefaultHeight] = useSetting(
    settingsAtom,
    'incomingInlineImagesDefaultHeight'
  );
  const [incomingInlineImagesMaxHeight] = useSetting(settingsAtom, 'incomingInlineImagesMaxHeight');

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
    [mx, room.roomId, mentionClickHandler, nicknames, settingsLinkBaseUrl]
  );
  const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
    () =>
      getReactCustomHtmlParser(mx, room.roomId, {
        settingsLinkBaseUrl,
        linkifyOpts,
        highlightRegex: options.highlightRegex,
        useAuthentication,
        handleSpoilerClick: spoilerClickHandler,
        handleMentionClick: mentionClickHandler,
        nicknames,
        autoplayEmojis,
        incomingInlineImagesDefaultHeight,
        incomingInlineImagesMaxHeight,
      }),
    [
      mx,
      room.roomId,
      settingsLinkBaseUrl,
      linkifyOpts,
      options.highlightRegex,
      useAuthentication,
      spoilerClickHandler,
      mentionClickHandler,
      nicknames,
      autoplayEmojis,
      incomingInlineImagesDefaultHeight,
      incomingInlineImagesMaxHeight,
    ]
  );
  const rendererOptions = useMemo<MessagePreviewRendererOptions>(
    () => ({
      room,
      mediaAutoLoad,
      bundledPreview,
      urlPreview: room.hasEncryptionStateEvent() ? encUrlPreview : urlPreview,
      htmlReactParserOptions,
      linkifyOpts,
    }),
    [
      room,
      mediaAutoLoad,
      bundledPreview,
      urlPreview,
      encUrlPreview,
      htmlReactParserOptions,
      linkifyOpts,
    ]
  );

  return useMessagePreviewRenderer(rendererOptions);
}

export type MessagePreviewProps = {
  room: Room;
  event: MatrixEvent;
  renderContent: ReturnType<typeof useMessagePreviewRenderer>;
  profile?: Partial<UserProfile>;
  actions?: ReactNode;
  onOpen?: MouseEventHandler<HTMLButtonElement>;
  hour24Clock: boolean;
  dateFormatString: string;
};

export function MessagePreview({
  room,
  event,
  renderContent,
  profile,
  actions,
  onOpen,
  hour24Clock,
  dateFormatString,
}: MessagePreviewProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const nicknames = useAtomValue(nicknamesAtom);
  const sender = event.getSender() ?? '';
  const openUserRoomProfile = useOpenUserRoomProfile();
  const [contentVersion, setContentVersion] = useState(0);

  useEffect(() => {
    const handleUpdate = () => setContentVersion((version) => version + 1);
    event.on(MatrixEventEvent.Decrypted, handleUpdate);
    event.on(MatrixEventEvent.Replaced, handleUpdate);
    return () => {
      event.off(MatrixEventEvent.Decrypted, handleUpdate);
      event.off(MatrixEventEvent.Replaced, handleUpdate);
    };
  }, [event]);

  const userProfile = useUserProfile(sender, room, profile, false, false);
  const { color, font } = useSableCosmetics(sender, room, false, false);
  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);
  const getMemberPowerTag = useGetMemberPowerTag(room, creators, powerLevels);

  const fallbackDisplayName =
    getMemberDisplayName(room, sender, nicknames) ??
    userProfile.displayName ??
    profile?.displayName ??
    getMxIdLocalPart(sender) ??
    sender;
  const perMessageProfile = useMemo(() => {
    void contentVersion;
    const { content } = resolvePreviewContent(
      room,
      event,
      () => event.getContent()['m.new_content'] ?? event.getContent()
    );
    const beeperProfile = content['com.beeper.per_message_profile'] as
      | PerMessageProfileBeeperFormat
      | undefined;
    return beeperProfile ? convertBeeperFormatToOurPerMessageProfile(beeperProfile) : undefined;
  }, [room, event, contentVersion]);
  const [showPronouns] = useSetting(settingsAtom, 'showPronouns');
  const [parsePronouns] = useSetting(settingsAtom, 'parsePronouns');
  const { cleanedDisplayName: displayName, inlinePronoun } = useMemo(
    () => getParsedPronouns(perMessageProfile?.displayname || fallbackDisplayName, parsePronouns),
    [perMessageProfile?.displayname, fallbackDisplayName, parsePronouns]
  );
  const pronouns = useMemo(() => {
    const resolved = [
      ...(perMessageProfile?.['io.fsky.nyx.pronouns'] ?? userProfile.pronouns ?? []),
    ];
    if (
      inlinePronoun &&
      !resolved.some((item) => item.summary?.toLowerCase() === inlinePronoun.toLowerCase())
    ) {
      resolved.push({ summary: inlinePronoun, language: 'en' });
    }
    return resolved;
  }, [perMessageProfile, userProfile.pronouns, inlinePronoun]);
  const avatarMxc =
    perMessageProfile?.avatar_url ??
    getMemberAvatarMxc(room, sender) ??
    userProfile.avatarUrl ??
    profile?.avatarUrl;
  const memberPowerTag = getMemberPowerTag(sender);
  const tagIconSrc = memberPowerTag?.icon
    ? getPowerTagIconSrc(mx, useAuthentication, memberPowerTag.icon)
    : undefined;
  const getContent = useCallback(
    () => event.getContent()['m.new_content'] ?? event.getContent(),
    [event]
  ) as GetContentCallback;
  const handleUserClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      openUserRoomProfile(
        room.roomId,
        undefined,
        sender,
        perMessageProfile,
        evt.currentTarget.getBoundingClientRect()
      );
    },
    [openUserRoomProfile, room.roomId, perMessageProfile, sender]
  );

  return (
    <ModernLayout
      before={
        <AvatarBase>
          <Avatar as="button" size="300" data-user-id={sender} onClick={handleUserClick}>
            <UserAvatar
              userId={sender}
              src={
                avatarMxc
                  ? (mxcUrlToHttp(mx, avatarMxc, useAuthentication, 48, 48, 'crop') ?? undefined)
                  : undefined
              }
              alt={displayName}
              renderFallback={() => userFallbackIcon('lg')}
            />
          </Avatar>
        </AvatarBase>
      }
    >
      <Box gap="300" justifyContent="SpaceBetween" alignItems="Center" grow="Yes">
        <Box gap="200" alignItems="Baseline">
          <Box alignItems="Center" gap="200">
            <Username
              as="button"
              data-user-id={sender}
              onClick={handleUserClick}
              onContextMenu={handleUserClick}
              style={{ color, fontFamily: font }}
            >
              <Text as="span" truncate>
                <UsernameBold>{displayName}</UsernameBold>
              </Text>
            </Username>
            {showPronouns && <Pronouns pronouns={pronouns} tagColor={color ?? 'currentColor'} />}
            {tagIconSrc && <PowerIcon size="100" iconSrc={tagIconSrc} />}
          </Box>
          <Time ts={event.getTs()} hour24Clock={hour24Clock} dateFormatString={dateFormatString} />
        </Box>
        {actions}
      </Box>
      {event.replyEventId && (
        <Reply
          room={room}
          replyEventId={event.replyEventId}
          threadRootId={event.threadRootId}
          mentions={event.getContent()['m.mentions']}
          onClick={onOpen}
        />
      )}
      <Box direction="Column" grow="Yes" style={{ minWidth: 0 }}>
        {renderContent(event.getType(), false, event, displayName, getContent)}
      </Box>
    </ModernLayout>
  );
}
