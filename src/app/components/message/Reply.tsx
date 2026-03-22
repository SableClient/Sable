import { Box, Chip, Icon, IconSrc, Icons, Text, as, color, toRem } from 'folds';
import { EventTimelineSet, Room, SessionMembershipData } from '$types/matrix-sdk';
import { MouseEventHandler, ReactNode, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import classNames from 'classnames';
import parse from 'html-react-parser';
import { useAtomValue } from 'jotai';
import { getMemberDisplayName, trimReplyFromBody, trimReplyFromFormattedBody } from '$utils/room';
import { getMxIdLocalPart } from '$utils/matrix';
import { randomNumberBetween } from '$utils/common';
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
import { StateEvent, MessageEvent } from '$types/matrix/room';
import { useMentionClickHandler } from '$hooks/useMentionClickHandler';
import { useTranslation } from 'react-i18next';
import * as customHtmlCss from '$styles/CustomHtml.css';
import {
  MessageBadEncryptedContent,
  MessageBlockedContent,
  MessageDeletedContent,
  MessageFailedContent,
} from './content';
import * as css from './Reply.css';
import { LinePlaceholder } from './placeholder';

type ReplyLayoutProps = {
  userColor?: string;
  username?: ReactNode;
  icon?: IconSrc;
};
export const ReplyLayout = as<'div', ReplyLayoutProps>(
  ({ username, userColor, icon, className, children, ...props }, ref) => (
    <Box
      className={classNames(css.Reply, className)}
      alignItems="Center"
      gap="100"
      {...props}
      ref={ref}
    >
      <Box style={{ color: userColor }} alignItems="Center" shrink="No">
        <Icon size="100" src={Icons.ReplyArrow} />
      </Box>
      {!!icon && <Icon style={{ opacity: 0.6 }} size="50" src={icon} />}
      <Box style={{ color: userColor, maxWidth: toRem(200) }} alignItems="Center" shrink="No">
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
  onClick?: MouseEventHandler;
};

export const Reply = as<'div', ReplyProps>(
  ({ room, timelineSet, replyEventId, threadRootId, onClick, ...props }, ref) => {
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

    const fallbackBody = isRedacted ? <MessageDeletedContent /> : <MessageFailedContent />;

    const badEncryption = replyEvent?.getContent().msgtype === 'm.bad.encrypted';
    const mentionClickHandler = useMentionClickHandler(room.roomId);

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

    const replyLinkifyOpts = useMemo(
      () => ({
        ...LINKIFY_OPTS,
        render: factoryRenderLinkifyWithMention((href) =>
          renderMatrixMention(
            mx,
            room.roomId,
            href,
            makeMentionCustomProps(mentionClickHandler),
            nicknames
          )
        ),
      }),
      [mx, room.roomId, mentionClickHandler, nicknames]
    );

    if (format === 'org.matrix.custom.html' && formattedBody) {
      const strippedHtml = trimReplyFromFormattedBody(formattedBody)
        .replaceAll(/<br\s*\/?>/gi, ' ')
        .replaceAll(/<\/p>\s*<p[^>]*>/gi, ' ')
        .replaceAll(/<\/?p[^>]*>/gi, '')
        .replaceAll(/<\/li>\s*<li[^>]*>/gi, ' ')
        .replaceAll(/<\/?(ul|ol|li|blockquote|h[1-6]|pre|div)[^>]*>/gi, '')
        .replaceAll(/(?:\r\n|\r|\n)/g, ' ');
      const parserOpts = getReactCustomHtmlParser(mx, room.roomId, {
        linkifyOpts: replyLinkifyOpts,
        useAuthentication,
        nicknames,
        handleMentionClick: mentionClickHandler,
      });
      bodyJSX = parse(strippedHtml, parserOpts) as JSX.Element;
    } else if (body) {
      const strippedBody = trimReplyFromBody(body).replaceAll(/(?:\r\n|\r|\n)/g, ' ');
      bodyJSX = scaleSystemEmoji(strippedBody);
    } else if (eventType === StateEvent.RoomMember && !!replyEvent) {
      const parsedMemberEvent = parseMemberEvent(replyEvent);
      image = parsedMemberEvent.icon;
      bodyJSX = parsedMemberEvent.body;
    } else if (eventType === StateEvent.RoomName) {
      image = Icons.Hash;
      bodyJSX = t('Organisms.RoomCommon.changed_room_name');
    } else if (eventType === StateEvent.RoomTopic) {
      image = Icons.Hash;
      bodyJSX = ' changed room topic';
    } else if (eventType === StateEvent.RoomAvatar) {
      image = Icons.Hash;
      bodyJSX = ' changed room avatar';
    } else if (eventType === StateEvent.GroupCallMemberPrefix && !!replyEvent) {
      const callJoined = replyEvent.getContent<SessionMembershipData>().application;
      image = callJoined ? Icons.Phone : Icons.PhoneDown;
      bodyJSX = callJoined ? ' joined the call' : ' ended the call';
    } else if (Object.values(MessageEvent).every((v) => v !== eventType)) {
      image = Icons.Code;
      bodyJSX = (
        <>
          {' sent '}
          <code className={customHtmlCss.Code}>{eventType}</code>
          {' state event'}
        </>
      );
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
          username={
            sender &&
            eventType !== StateEvent.RoomMember && (
              <Text size="T300" truncate style={{ fontFamily: usernameFont }}>
                <b>{getMemberDisplayName(room, sender, nicknames) ?? getMxIdLocalPart(sender)}</b>
              </Text>
            )
          }
          data-event-id={replyEventId}
          onClick={replyEvent !== null && !isBlockedSender ? onClick : undefined}
        >
          {replyEvent !== undefined && !isPendingDecrypt ? (
            <Text size="T300" truncate>
              {(() => {
                if (isBlockedSender) return <MessageBlockedContent />;
                if (badEncryption) return <MessageBadEncryptedContent />;
                return bodyJSX;
              })()}
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
              queryClient.invalidateQueries({ queryKey: [room.roomId, replyEventId] });
            }}
          />
        )}
      </Box>
    );
  }
);
