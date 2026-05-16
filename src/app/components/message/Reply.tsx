import type { IconSrc } from 'folds';
import { Box, Chip, Icon, Icons, Text, as, color, toRem } from 'folds';
import type { EventTimelineSet, IMentions, Room, SessionMembershipData } from '$types/matrix-sdk';
import { EventType, MsgType } from '$types/matrix-sdk';
import type { MouseEventHandler, ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import classNames from 'classnames';
import parse from 'html-react-parser';
import { useAtomValue } from 'jotai';
import { getMemberDisplayName, trimReplyFromBody, trimReplyFromFormattedBody } from '$utils/room';
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
} from './content';
import * as css from './Reply.css';
import { LinePlaceholder } from './placeholder';

const ROOM_REPLY_TIMELINE_EVENT_TYPES = new Set<string>([
  EventType.RoomMessage as string,
  EventType.RoomMessageEncrypted as string,
  EventType.Sticker as string,
]);

const nonEmptyTrimmed = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
};

export const replyPreviewBodyForTimelineEvent = (
  eventType: string | undefined,
  content: Record<string, unknown>,
  isRedacted: boolean
): ReactNode | undefined => {
  if (!eventType || !ROOM_REPLY_TIMELINE_EVENT_TYPES.has(eventType)) return undefined;
  if (isRedacted) return <MessageDeletedContent />;

  if (eventType === (EventType.Sticker as string)) {
    const stickerBody = nonEmptyTrimmed(content.body);
    if (stickerBody) return scaleSystemEmoji(stickerBody);
    return 'Sticker';
  }

  const rawMsgtype = content.msgtype;
  if (typeof rawMsgtype !== 'string') {
    return <MessageUnsupportedContent />;
  }
  const msgtype = rawMsgtype as MsgType;

  const trimmedBody = nonEmptyTrimmed(
    typeof content.body === 'string' ? trimReplyFromBody(content.body) : ''
  );
  const filename = nonEmptyTrimmed(content.filename);
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
  icon?: IconSrc;
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
        {replyIcon || <Icon size="100" src={Icons.ReplyArrow} />}
      </Box>
      {!!icon && <Icon style={{ opacity: 0.6 }} size="50" src={icon} />}
      <Box style={{ color: userColor, maxWidth: toRem(200) }} alignItems="Center" shrink="No">
        {mentioned && <Icon size="100" src={Icons.Mention} />}
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
    <Icon size="50" src={Icons.Thread} />
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
    { room, timelineSet, replyEventId, threadRootId, mentions, onClick, replyIcon, ...props },
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

    const { body, formatted_body: formattedBody, format } = replyEvent?.getContent() ?? {};
    const sender = replyEvent?.getSender();
    const eventType = replyEvent?.getType();

    const ignoredUsers = useIgnoredUsers();
    const isBlockedSender = !!sender && ignoredUsers.includes(sender);
    const { t } = useTranslation();
    const isRedacted = replyEvent?.isRedacted() === true;

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

    const fallbackBody = isRedacted ? <MessageDeletedContent /> : <MessageFailedContent />;

    const badEncryption = replyEvent?.getContent().msgtype === 'm.bad.encrypted';
    const mentionClickHandler = useMentionClickHandler(room.roomId);
    const isFormattedReply =
      format === 'org.matrix.custom.html' && typeof formattedBody === 'string';
    const hasPlainTextReply = typeof body === 'string' && body !== '';

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
    let image: IconSrc | undefined;
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

    if (isFormattedReply && formattedBody !== '') {
      const sanitizedHtml = sanitizeReplyFormattedPreview(formattedBody);
      const textOnly = sanitizedHtml
        .replaceAll(/<br\s*\/?>/gi, ' ')
        .replaceAll(/<[^>]+>/g, '')
        .replaceAll(/\s+/g, ' ')
        .trim();
      if (textOnly !== '') {
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
      }
    } else if (hasPlainTextReply) {
      const strippedBody = trimReplyFromBody(body).replaceAll(/(?:\r\n|\r|\n)/g, ' ');
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
      image = Icons.Hash;
      bodyJSX = t('Organisms.RoomCommon.changed_room_name');
    } else if (eventType === EventType.RoomTopic) {
      image = Icons.Hash;
      bodyJSX = ' changed room topic';
    } else if (eventType === EventType.RoomAvatar) {
      image = Icons.Hash;
      bodyJSX = ' changed room avatar';
    } else if (eventType === EventType.GroupCallMemberPrefix && !!replyEvent) {
      const callJoined = replyEvent.getContent<SessionMembershipData>().application;
      image = callJoined ? Icons.Phone : Icons.PhoneDown;
      bodyJSX = callJoined ? ' joined the call' : ' ended the call';
    } else if (eventType === EventType.RoomPinnedEvents && replyEvent) {
      const { pinned } = replyEvent.getContent();
      const prevPinned = replyEvent.getPrevContent().pinned;
      const pinsAdded =
        prevPinned && pinned && pinned.filter((x: string) => !prevPinned.includes(x));
      const pinsRemoved =
        prevPinned && pinned && prevPinned.filter((x: string) => !pinned.includes(x));
      image = Icons.Pin;
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
        image = Icons.Code;
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
            (isRedacted && <MessageDeletedContent />) || (
              <LinePlaceholder
                style={{
                  backgroundColor: color.SurfaceVariant.ContainerActive,
                  width: toRem(placeholderWidth),
                  maxWidth: '100%',
                }}
              />
            )
          )}
        </ReplyLayout>
        {replyEvent === null && (
          <Chip
            variant="Critical"
            radii="Pill"
            before={<Icon size="50" src={Icons.Reload} />}
            onClick={(evt) => {
              evt.stopPropagation();
              queryClient.invalidateQueries({
                queryKey: [room.roomId, replyEventId],
              });
            }}
          />
        )}
      </Box>
    );
  }
);
