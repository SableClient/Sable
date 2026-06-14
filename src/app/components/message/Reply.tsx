import { Box, Chip, Text, as, color, toRem } from 'folds';
import type { EventTimelineSet, IMentions, Room, SessionMembershipData } from '$types/matrix-sdk';
import { EventType, MsgType } from '$types/matrix-sdk';
import type { MouseEventHandler, ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import classNames from 'classnames';
import parse from 'html-react-parser';
import { useAtomValue } from 'jotai';
import {
  ArrowBendUpRightIcon,
  ArrowsClockwise,
  ChatCircle,
  chipIcon,
  Code,
  Hash,
  ListBullets,
  menuIcon,
  Phone,
  PhoneDisconnect,
  PushPin,
  timelineIcon,
  Trash,
  Smiley,
} from '$components/icons/phosphor';
import {
  getMemberDisplayName,
  getReactionKey,
  getReactionShortcode,
  getRedactionTargetId,
  trimReplyFromBody,
  trimReplyFromFormattedBody,
} from '$utils/room';
import { getMxIdLocalPart } from '$utils/matrix';
import { randomNumberBetween } from '$utils/common';
import { sanitizeCustomHtml } from '$utils/sanitize';
import {
  getReactCustomHtmlParser,
  scaleSystemEmoji,
  LINKIFY_OPTS,
  makeMentionCustomProps,
  factoryRenderLinkifyWithMention,
  renderMatrixMention,
} from '$plugins/react-custom-html-parser';
import { useRoomEvent } from '$hooks/useRoomEvent';
import { useSableCosmetics } from '$hooks/useSableCosmetics';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useIgnoredUsers } from '$hooks/useIgnoredUsers';
import { nicknamesAtom } from '$state/nicknames';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMemberEventParser } from '$hooks/useMemberEventParser';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';

import { useMentionClickHandler } from '$hooks/useMentionClickHandler';
import { useTranslation } from 'react-i18next';
import * as customHtmlCss from '$styles/CustomHtml.css';
import { useSettingsLinkBaseUrl } from '$features/settings/useSettingsLinkBaseUrl';
import {
  MessageBadEncryptedContent,
  MessageBlockedContent,
  MessageDeletedContent,
  MessageEmptyContent,
  MessageFailedContent,
  MessageUnsupportedContent,
  ReactionDeletedContent,
} from './content';
import * as css from './Reply.css';
import { LinePlaceholder } from './placeholder';
import { ReactionKeyInline } from './ReactionKeyInline';
import { M_POLL_START, M_TEXT } from 'matrix-js-sdk';

const ROOM_REPLY_TIMELINE_EVENT_TYPES = new Set<string>([
  EventType.RoomMessage as string,
  EventType.RoomMessageEncrypted as string,
  EventType.Sticker as string,
  EventType.Reaction as string,
  EventType.RoomRedaction as string,
]);

const nonEmptyTrimmed = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
};

const FORMATTED_EMOTICON_IMG_RE = /<img\b[^>]*\bdata-mx-emoticon\b/i;

export const replyFormattedPreviewTextOnly = (sanitizedHtml: string): string =>
  sanitizedHtml
    .replaceAll(/<br\s*\/?>/gi, ' ')
    .replaceAll(/<[^>]+>/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();

export const shouldParseReplyFormattedPreview = (sanitizedHtml: string): boolean => {
  const textOnly = replyFormattedPreviewTextOnly(sanitizedHtml);
  return textOnly !== '' || FORMATTED_EMOTICON_IMG_RE.test(sanitizedHtml);
};

export const replyPreviewBodyForTimelineEvent = (
  eventType: string | undefined,
  content: Record<string, unknown>,
  isRedacted: boolean
): ReactNode | undefined => {
  if (!eventType) return undefined;

  if (eventType === (EventType.RoomRedaction as string)) {
    return 'redacted a message';
  }

  if (eventType === (EventType.Reaction as string)) {
    if (isRedacted) {
      return <ReactionDeletedContent hideIcon />;
    }
    return undefined;
  }

  if (!ROOM_REPLY_TIMELINE_EVENT_TYPES.has(eventType)) return undefined;

  const effectiveContent =
    content['m.new_content'] != null && typeof content['m.new_content'] === 'object'
      ? (content['m.new_content'] as Record<string, unknown>)
      : content;

  if (isRedacted) return <MessageDeletedContent />;

  if (eventType === (EventType.Sticker as string)) {
    const stickerBody = nonEmptyTrimmed(effectiveContent.body);
    if (stickerBody) return scaleSystemEmoji(stickerBody);
    return 'Sticker';
  }

  const rawMsgtype = effectiveContent.msgtype;
  if (typeof rawMsgtype !== 'string') {
    return <MessageUnsupportedContent />;
  }
  const msgtype = rawMsgtype as MsgType;

  const trimmedBody = nonEmptyTrimmed(
    typeof effectiveContent.body === 'string' ? trimReplyFromBody(effectiveContent.body) : ''
  );
  const filename = nonEmptyTrimmed(effectiveContent.filename);
  if (trimmedBody) return undefined;

  const attachmentLabel = filename;

  switch (msgtype) {
    case MsgType.Image:
      return attachmentLabel ?? 'Image';
    case MsgType.Video:
      return attachmentLabel ?? 'Video';
    case MsgType.Audio:
      return attachmentLabel ?? 'Audio';
    case MsgType.File:
      return attachmentLabel ?? 'Attachment';
    case MsgType.Location:
      return 'Location';
    case MsgType.Text:
    case MsgType.Emote:
    case MsgType.Notice:
      return <MessageEmptyContent />;
    default:
      return <MessageUnsupportedContent />;
  }
};

type ReplyLayoutProps = {
  userColor?: string;
  username?: ReactNode;
  icon?: ReactNode;
  mentioned: boolean;
  replyIcon?: JSX.Element;
};
export const ReplyLayout = as<'div', ReplyLayoutProps>(
  ({ username, userColor, icon, className, mentioned, children, replyIcon, ...props }, ref) => (
    <Box
      className={classNames(css.Reply, className)}
      alignItems="Center"
      gap="100"
      {...props}
      ref={ref}
    >
      <Box style={{ color: userColor }} alignItems="Center" shrink="No">
        {replyIcon ?? menuIcon(ArrowBendUpRightIcon)}
      </Box>
      {icon}
      <Box style={{ color: userColor, maxWidth: toRem(200) }} alignItems="Center" shrink="No">
        {mentioned && '@'}
        {username}
      </Box>
      <Box grow="Yes" className={css.ReplyContent}>
        {children}
      </Box>
    </Box>
  )
);

export const ThreadIndicator = as<'div'>(({ ...props }, ref) => (
  <Box
    shrink="No"
    className={css.ThreadIndicator}
    alignItems="Center"
    gap="100"
    {...props}
    ref={ref}
  >
    {chipIcon(ChatCircle)}
    <Text size="L400">Thread</Text>
  </Box>
));

type ReplyProps = {
  room: Room;
  timelineSet?: EventTimelineSet;
  replyEventId: string;
  threadRootId?: string;
  mentions?: IMentions;
  onClick?: MouseEventHandler;
  replyIcon?: JSX.Element;
  previewBodyOverride?: string;
};

export const sanitizeReplyFormattedPreview = (formattedBody: string): string => {
  const safeFormattedBody = sanitizeCustomHtml(formattedBody);
  const strippedHtml = trimReplyFromFormattedBody(safeFormattedBody)
    .replaceAll(/<br\s*\/?>/gi, ' ')
    .replaceAll(/<\/p>\s*<p[^>]*>/gi, ' ')
    .replaceAll(/<\/?p[^>]*>/gi, '')
    .replaceAll(/<\/li>\s*<li[^>]*>/gi, ' ')
    .replaceAll(/<\/?(ul|ol|li|blockquote|h[1-6]|pre|div)[^>]*>/gi, '')
    .replaceAll(/(?:\r\n|\r|\n)/g, ' ');

  return strippedHtml;
};

export const Reply = as<'div', ReplyProps>(
  (
    {
      room,
      timelineSet,
      replyEventId,
      threadRootId,
      mentions,
      onClick,
      replyIcon,
      previewBodyOverride,
      ...props
    },
    ref
  ) => {
    const placeholderWidth = useMemo(() => randomNumberBetween(40, 400), []);
    const getFromLocalTimeline = useCallback(
      () => timelineSet?.findEventById(replyEventId),
      [timelineSet, replyEventId]
    );
    const replyEvent = useRoomEvent(room, replyEventId, getFromLocalTimeline);
    const queryClient = useQueryClient();

    const mx = useMatrixClient();

    const rawContent = replyEvent?.getContent() ?? {};
    const contentForPreview =
      rawContent['m.new_content'] != null && typeof rawContent['m.new_content'] === 'object'
        ? (rawContent['m.new_content'] as Record<string, unknown>)
        : rawContent;

    const { body, formatted_body: formattedBody, format } = contentForPreview;
    const extensibleContent = contentForPreview[M_TEXT.name] as
      | string
      | { body: string }
      | undefined;
    const extensibleBody = (extensibleContent as { body: string })?.body ?? extensibleContent;
    const sender = replyEvent?.getSender();
    const eventType = replyEvent?.getType();
    const isRedacted = replyEvent?.isRedacted() === true;

    const ignoredUsers = useIgnoredUsers();
    const isBlockedSender = !!sender && ignoredUsers.includes(sender);
    const { t } = useTranslation();

    const parseMemberEvent = useMemberEventParser();

    const { color: usernameColor, font: usernameFont } = useSableCosmetics(sender ?? '', room);
    const nicknames = useAtomValue(nicknamesAtom);
    const useAuthentication = useMediaAuthentication();
    const settingsLinkBaseUrl = useSettingsLinkBaseUrl();
    const [incomingInlineImagesDefaultHeight] = useSetting(
      settingsAtom,
      'incomingInlineImagesDefaultHeight'
    );
    const [incomingInlineImagesMaxHeight] = useSetting(
      settingsAtom,
      'incomingInlineImagesMaxHeight'
    );

    const fallbackBody =
      isRedacted && eventType === (EventType.Reaction as string) ? (
        <ReactionDeletedContent
          mx={mx}
          reactionKey={replyEvent ? getReactionKey(replyEvent) : undefined}
          shortcode={replyEvent ? getReactionShortcode(replyEvent) : undefined}
          useAuthentication={useAuthentication}
          hideIcon
        />
      ) : isRedacted ? (
        <MessageDeletedContent />
      ) : (
        <MessageFailedContent />
      );

    const badEncryption = replyEvent?.getContent().msgtype === 'm.bad.encrypted';
    const mentionClickHandler = useMentionClickHandler(room.roomId);
    const isFormattedReply =
      format === 'org.matrix.custom.html' && typeof formattedBody === 'string';
    const hasPlainTextReply = typeof body === 'string' && body !== '';
    const hasExtensibleBody = typeof extensibleBody === 'string' && extensibleBody !== '';
    // An encrypted event that hasn't been decrypted yet (keys pending) has an
    // empty result from getClearContent().  Treat it as still-loading rather
    // than a failure so the UI shows a placeholder instead of MessageFailedContent
    // until the MatrixEventEvent.Decrypted callback fires.
    const isPendingDecrypt =
      replyEvent !== undefined &&
      replyEvent !== null &&
      replyEvent.isEncrypted() &&
      !replyEvent.isDecryptionFailure() &&
      !replyEvent.getClearContent();

    let bodyJSX: ReactNode = fallbackBody;
    let image: ReactNode | undefined;
    let mentioned = sender != null && (mentions?.user_ids?.includes(sender) ?? false);

    const replyLinkifyOpts = useMemo(
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
    if (eventType === M_POLL_START.name) {
      const question = (
        replyEvent?.getContent()[M_POLL_START.name] as {
          question: { [M_TEXT.name]?: string; body?: string };
        }
      )?.question;
      image = timelineIcon(ListBullets);
      if (question) {
        bodyJSX = `'s poll asking ${question[M_TEXT.name] ?? question.body ?? ''}`;
      }
    } else if (isFormattedReply && formattedBody !== '') {
      const sanitizedHtml = sanitizeReplyFormattedPreview(formattedBody);
      if (shouldParseReplyFormattedPreview(sanitizedHtml)) {
        const parserOpts = getReactCustomHtmlParser(mx, room.roomId, {
          settingsLinkBaseUrl,
          linkifyOpts: replyLinkifyOpts,
          useAuthentication,
          nicknames,
          handleMentionClick: mentionClickHandler,
          incomingInlineImagesDefaultHeight,
          incomingInlineImagesMaxHeight,
        });
        bodyJSX = parse(sanitizedHtml, parserOpts) as JSX.Element;
      } else if (hasPlainTextReply) {
        const strippedBody = trimReplyFromBody(body).replaceAll(/(?:\r\n|\r|\n)/g, ' ');
        bodyJSX = scaleSystemEmoji(strippedBody);
      } else if (hasExtensibleBody) {
        const strippedBody = trimReplyFromBody(extensibleBody).replaceAll(/(?:\r\n|\r|\n)/g, ' ');
        bodyJSX = scaleSystemEmoji(strippedBody);
      }
    } else if (hasPlainTextReply) {
      const strippedBody = trimReplyFromBody(body).replaceAll(/(?:\r\n|\r|\n)/g, ' ');
      bodyJSX = scaleSystemEmoji(strippedBody);
    } else if (hasExtensibleBody) {
      const strippedBody = trimReplyFromBody(extensibleBody).replaceAll(/(?:\r\n|\r|\n)/g, ' ');
      bodyJSX = scaleSystemEmoji(strippedBody);
    } else if (eventType === EventType.RoomMember && !!replyEvent) {
      const parsedMemberEvent = parseMemberEvent(replyEvent);
      image = parsedMemberEvent.icon;
      mentioned = false;
      bodyJSX = (
        <Box direction="Row" style={{ columnGap: toRem(6) }}>
          {' '}
          {parsedMemberEvent.body}{' '}
        </Box>
      );
    } else if (eventType === EventType.RoomName) {
      image = timelineIcon(Hash);
      bodyJSX = t('Organisms.RoomCommon.changed_room_name');
    } else if (eventType === EventType.RoomTopic) {
      image = timelineIcon(Hash);
      bodyJSX = ' changed room topic';
    } else if (eventType === EventType.RoomAvatar) {
      image = timelineIcon(Hash);
      bodyJSX = ' changed room avatar';
    } else if (eventType === EventType.GroupCallMemberPrefix && !!replyEvent) {
      const callJoined = replyEvent.getContent<SessionMembershipData>().application;
      image = callJoined ? timelineIcon(Phone) : timelineIcon(PhoneDisconnect);
      bodyJSX = callJoined ? ' joined the call' : ' ended the call';
    } else if (eventType === EventType.RoomRedaction && replyEvent) {
      image = timelineIcon(Trash);
      const redactionTargetId = getRedactionTargetId(replyEvent);
      const redactionTarget = redactionTargetId
        ? (timelineSet?.findEventById(redactionTargetId) ??
          room.findEventById(redactionTargetId) ??
          null)
        : null;
      bodyJSX =
        redactionTarget?.getType() === (EventType.Reaction as string)
          ? ' redacted a reaction'
          : ' redacted a message';
    } else if (eventType === EventType.Reaction && !!replyEvent) {
      image = isRedacted ? timelineIcon(Trash) : timelineIcon(Smiley);
      if (isRedacted) {
        bodyJSX = (
          <ReactionDeletedContent
            mx={mx}
            reactionKey={getReactionKey(replyEvent)}
            shortcode={getReactionShortcode(replyEvent)}
            useAuthentication={useAuthentication}
            hideIcon
          />
        );
      } else {
        const reactionKey = getReactionKey(replyEvent);
        const reactionShortcode = getReactionShortcode(replyEvent);
        bodyJSX = (
          <>
            {' reacted with '}
            <ReactionKeyInline
              mx={mx}
              reactionKey={reactionKey}
              shortcode={reactionShortcode}
              useAuthentication={useAuthentication}
            />
          </>
        );
      }
    } else if (eventType === EventType.RoomPinnedEvents && replyEvent) {
      const { pinned } = replyEvent.getContent();
      const prevPinned = replyEvent.getPrevContent().pinned;
      const pinsAdded =
        prevPinned && pinned && pinned.filter((x: string) => !prevPinned.includes(x));
      const pinsRemoved =
        prevPinned && pinned && prevPinned.filter((x: string) => !pinned.includes(x));
      image = timelineIcon(PushPin);
      bodyJSX = (
        <>
          {(pinsAdded?.length > 0 &&
            `pinned ${pinsAdded.length} message${pinsAdded.length > 1 ? 's' : ''}`) ||
            ''}
          {(pinsAdded?.length > 0 && pinsRemoved?.length > 0 && ` and `) || ''}
          {(pinsRemoved?.length > 0 &&
            `unpinned ${pinsRemoved.length} message${pinsRemoved.length > 1 ? 's' : ''}`) ||
            ''}
          {(!pinsAdded || pinsAdded.length <= 0) &&
            (!pinsRemoved || pinsRemoved.length <= 0) &&
            `has not changed the pins`}
        </>
      );
    } else if (replyEvent && eventType) {
      const timelinePreview = replyPreviewBodyForTimelineEvent(
        eventType,
        replyEvent.getContent() as Record<string, unknown>,
        isRedacted
      );
      if (timelinePreview !== undefined) {
        bodyJSX = timelinePreview;
      } else if (replyEvent.isState()) {
        image = timelineIcon(Code);
        bodyJSX = (
          <>
            {' sent '}
            <code className={customHtmlCss.Code}>{eventType}</code>
            {' state event'}
          </>
        );
      } else {
        bodyJSX = <MessageUnsupportedContent />;
      }
    }
    if (typeof previewBodyOverride === 'string' && previewBodyOverride.length > 0 && !isRedacted) {
      const strippedOverride = trimReplyFromBody(previewBodyOverride).replaceAll(
        /(?:\r\n|\r|\n)/g,
        ' '
      );
      bodyJSX = scaleSystemEmoji(strippedOverride);
    }

    let replyContent = bodyJSX;
    if (isBlockedSender) {
      replyContent = <MessageBlockedContent />;
    } else if (badEncryption) {
      replyContent = <MessageBadEncryptedContent />;
    }

    return (
      <Box direction="Row" gap="200" alignItems="Center" {...props} ref={ref}>
        {threadRootId && (
          <ThreadIndicator as="button" data-event-id={threadRootId} onClick={onClick} />
        )}
        <ReplyLayout
          as="button"
          userColor={usernameColor}
          icon={image}
          replyIcon={replyIcon}
          mentioned={mentioned}
          username={
            sender &&
            eventType !== EventType.RoomMember && (
              <Text size="T300" truncate style={{ fontFamily: usernameFont }}>
                <b>{getMemberDisplayName(room, sender, nicknames) ?? getMxIdLocalPart(sender)}</b>
              </Text>
            )
          }
          data-event-id={replyEventId}
          onClick={replyEvent !== null && !isBlockedSender ? onClick : undefined}
        >
          {replyEvent !== undefined && !isPendingDecrypt ? (
            <Text size="T300" truncate style={{ unicodeBidi: 'plaintext' }}>
              {replyContent}
            </Text>
          ) : (
            <LinePlaceholder
              style={{
                backgroundColor: color.SurfaceVariant.ContainerActive,
                width: toRem(placeholderWidth),
                maxWidth: '100%',
              }}
            />
          )}
        </ReplyLayout>
        {replyEvent === null && (
          <Chip
            variant="Critical"
            radii="Pill"
            before={menuIcon(ArrowsClockwise)}
            onClick={(evt) => {
              evt.stopPropagation();
              void queryClient.invalidateQueries({
                queryKey: [room.roomId, replyEventId],
              });
            }}
          />
        )}
      </Box>
    );
  }
);
