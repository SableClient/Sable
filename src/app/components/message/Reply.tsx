import { Box, Chip, Icon, Icons, Text, as, color, toRem } from 'folds';
import { type EventTimelineSet, type Room } from '$types/matrix-sdk';
import { type MouseEventHandler, type ReactNode, useCallback, useMemo } from 'react';
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
} from '$plugins/react-custom-html-parser';
import { useRoomEvent } from '$hooks/useRoomEvent';
import { useSableCosmetics } from '$hooks/useSableCosmetics';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useIgnoredUsers } from '$hooks/useIgnoredUsers';
import { nicknamesAtom } from '$state/nicknames';
import { useMatrixClient } from '$hooks/useMatrixClient';
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
};
export const ReplyLayout = as<'div', ReplyLayoutProps>(
  ({ username, userColor, className, children, ...props }, ref) => (
    <Box
      className={classNames(css.Reply, className)}
      alignItems="Center"
      gap="100"
      {...props}
      ref={ref}
    >
      <Box style={{ color: userColor, maxWidth: toRem(200) }} alignItems="Center" shrink="No">
        <Icon size="100" src={Icons.ReplyArrow} />
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

    const ignoredUsers = useIgnoredUsers();
    const isBlockedSender = !!sender && ignoredUsers.includes(sender);

    const { color: usernameColor, font: usernameFont } = useSableCosmetics(sender ?? '', room);
    const nicknames = useAtomValue(nicknamesAtom);
    const useAuthentication = useMediaAuthentication();

    const fallbackBody = replyEvent?.isRedacted() ? (
      <MessageDeletedContent />
    ) : (
      <MessageFailedContent />
    );

    const badEncryption = replyEvent?.getContent().msgtype === 'm.bad.encrypted';

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

    if (format === 'org.matrix.custom.html' && formattedBody) {
      const strippedHtml = trimReplyFromFormattedBody(formattedBody)
        .replaceAll(/<br\s*\/?>/gi, ' ')
        .replaceAll(/<\/p>\s*<p[^>]*>/gi, ' ')
        .replaceAll(/<\/?p[^>]*>/gi, '')
        .replaceAll(/<\/li>\s*<li[^>]*>/gi, ' ')
        .replaceAll(/<\/?(ul|ol|li|blockquote|h[1-6]|pre|div)[^>]*>/gi, '')
        .replaceAll(/(?:\r\n|\r|\n)/g, ' ');
      const parserOpts = getReactCustomHtmlParser(mx, room.roomId, {
        linkifyOpts: LINKIFY_OPTS,
        useAuthentication,
        nicknames,
      });
      bodyJSX = parse(strippedHtml, parserOpts) as JSX.Element;
    } else if (body) {
      const strippedBody = trimReplyFromBody(body).replaceAll(/(?:\r\n|\r|\n)/g, ' ');
      bodyJSX = scaleSystemEmoji(strippedBody);
    }

    return (
      <Box direction="Row" gap="200" alignItems="Center" {...props} ref={ref}>
        {threadRootId && (
          <ThreadIndicator as="button" data-event-id={threadRootId} onClick={onClick} />
        )}
        <ReplyLayout
          as="button"
          userColor={usernameColor}
          username={
            sender && (
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
