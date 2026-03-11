import classNames from 'classnames';
import {
  Avatar,
  Box,
  Header,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  Scroll,
  Text,
  as,
  color,
  config,
} from 'folds';
import { IContent, MatrixEvent, Room } from '$types/matrix-sdk';
import { getMemberDisplayName } from '$utils/room';
import { getMxIdLocalPart } from '$utils/matrix';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useOpenUserRoomProfile } from '$state/hooks/userRoomProfile';
import { useSpaceOptionally } from '$hooks/useSpace';
import { getMouseEventCords } from '$utils/dom';
import { useAtomValue, useSetAtom } from 'jotai';
import { nicknamesAtom } from '$state/nicknames';
import { UserAvatar } from '$components/user-avatar';
import { RenderBody, Time } from '$components/message';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useCallback, useMemo, useState } from 'react';
import { getReactCustomHtmlParser, LINKIFY_OPTS } from '$plugins/react-custom-html-parser';
import { Opts as LinkifyOpts } from 'linkifyjs';
import { HTMLReactParserOptions } from 'html-react-parser';
import { useSpoilerClickHandler } from '$hooks/useSpoilerClickHandler';
import { modalAtom, ModalType } from '$state/modal';
import { roomIdToReplyDraftAtomFamily } from '$state/room/roomInputDrafts';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { usePowerLevelsContext } from '$hooks/usePowerLevels';
import { MessageEvent } from '$types/matrix/room';
import * as css from './EventHistory.css';

export type EventHistoryProps = {
  room: Room;
  mEvents: MatrixEvent[];
  requestClose: () => void;
};
export const EventHistory = as<'div', EventHistoryProps>(
  ({ className, room, mEvents, requestClose, ...props }, ref) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const openProfile = useOpenUserRoomProfile();
    const space = useSpaceOptionally();
    const nicknames = useAtomValue(nicknamesAtom);

    const getName = (userId: string) =>
      getMemberDisplayName(room, userId, nicknames) ?? getMxIdLocalPart(userId) ?? userId;

    const readerId = mEvents[0].event.sender ?? '';
    const name = getName(readerId ?? '');
    const avatarMxcUrl = room.getMember(readerId ?? '')?.getMxcAvatarUrl();
    const avatarUrl = avatarMxcUrl
      ? mx.mxcUrlToHttp(avatarMxcUrl, 100, 100, 'crop', undefined, false, useAuthentication)
      : undefined;

    const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
    const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

    const linkifyOpts = useMemo<LinkifyOpts>(() => ({ ...LINKIFY_OPTS }), []);
    const spoilerClickHandler = useSpoilerClickHandler();
    const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
      () =>
        getReactCustomHtmlParser(mx, mEvents[0].getRoomId(), {
          linkifyOpts,
          useAuthentication,
          handleSpoilerClick: spoilerClickHandler,
        }),
      [linkifyOpts, mEvents, mx, spoilerClickHandler, useAuthentication]
    );
    const powerLevels = usePowerLevelsContext();
    const creators = useRoomCreators(room);
    const permissions = useRoomPermissions(creators, powerLevels);
    const canRedact = permissions.action('redact', mx.getSafeUserId());
    const canDeleteOwn = permissions.event(MessageEvent.RoomRedaction, mx.getSafeUserId());
    const canDelete = canRedact || (canDeleteOwn && mEvents[0].getSender() === mx.getUserId());

    const setReplyDraft = useSetAtom(roomIdToReplyDraftAtomFamily(room.roomId));
    const triggerReply = useCallback(
      (replyId: string, startThread = false) => {
        const replyEvt = room.findEventById(replyId);
        if (!replyEvt) return;
        const content: IContent = replyEvt.getOriginalContent();
        const body = content?.['m.new_content']?.body ?? content?.body ?? '';
        const formattedBody =
          content?.['m.new_content']?.formatted_body ?? content?.formatted_body ?? '';
        const { 'm.relates_to': relation } = startThread
          ? { 'm.relates_to': { rel_type: 'm.thread', event_id: replyId } }
          : replyEvt.getWireContent();
        const senderId = replyEvt.getSender();
        if (senderId) {
          if (typeof body === 'string') {
            setReplyDraft({
              userId: senderId,
              eventId: replyId,
              body,
              formattedBody,
              relation,
            });
          } else {
            setReplyDraft({
              userId: senderId,
              eventId: replyId,
              body: '',
              formattedBody: '',
              relation,
            });
          }
        }
      },
      [room, setReplyDraft]
    );

    function MenuOptions({ mEvent }: { mEvent: MatrixEvent }) {
      const setModal = useSetAtom(modalAtom);
      return (
        <Menu className={css.MenuOptions}>
          <MenuItem
            size="300"
            after={<Icon size="100" src={Icons.ReplyArrow} />}
            radii="300"
            fill="None"
            variant="Secondary"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (mEvent.event.event_id) {
                triggerReply(mEvent.event.event_id, false);
                requestClose();
              }
            }}
          />
          <MenuItem
            size="300"
            after={<Icon size="100" src={Icons.ThreadReply} />}
            radii="300"
            fill="None"
            variant="Secondary"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (mEvent.event.event_id) {
                triggerReply(mEvent.event.event_id, true);
                requestClose();
              }
            }}
          />
          {canDelete && (
            <MenuItem
              size="300"
              after={<Icon size="100" src={Icons.Delete} />}
              radii="300"
              fill="None"
              variant="Critical"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setModal({
                  type: ModalType.Delete,
                  room,
                  mEvent,
                });
              }}
            />
          )}
        </Menu>
      );
    }

    function EventItem({ mEvent, EventContent }: { mEvent: MatrixEvent; EventContent: IContent }) {
      const [isHovered, setIsHovered] = useState(false);
      return (
        <Box
          style={{ position: 'relative', width: '100%' }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={() => setIsHovered(!isHovered)}
        >
          <Box className={css.EventItem}>
            <Time
              ts={mEvent.getTs()}
              hour24Clock={hour24Clock}
              dateFormatString={dateFormatString}
            />

            <Text size="T400" style={{ paddingLeft: '10px', wordBreak: 'break-word' }}>
              <RenderBody
                body={EventContent?.['m.new_content']?.body ?? EventContent?.body ?? ''}
                customBody={
                  EventContent?.['m.new_content']?.formatted_body ??
                  EventContent?.formatted_body ??
                  ''
                }
                htmlReactParserOptions={htmlReactParserOptions}
                linkifyOpts={linkifyOpts}
              />
            </Text>
          </Box>
          {isHovered && <MenuOptions mEvent={mEvent} />}
        </Box>
      );
    }

    return (
      <Box
        className={classNames(css.EventHistory, className)}
        direction="Column"
        {...props}
        ref={ref}
      >
        <Header className={css.Header} variant="Surface" size="600">
          <Box grow="Yes">
            <Text size="H3">Message version history</Text>
          </Box>
          <IconButton size="300" onClick={requestClose}>
            <Icon src={Icons.Cross} />
          </IconButton>
        </Header>
        <Header>
          <MenuItem
            key={readerId}
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: `${config.space.S200} ${config.space.S200}`,
              height: 'unset',
            }}
            radii="400"
            onClick={(event) => {
              openProfile(
                room.roomId,
                space?.roomId,
                readerId,
                getMouseEventCords(event.nativeEvent),
                'Bottom'
              );
            }}
            before={
              <Avatar size="300">
                <UserAvatar
                  userId={readerId ?? ''}
                  src={avatarUrl ?? undefined}
                  alt={name}
                  renderFallback={() => <Icon size="50" src={Icons.User} filled />}
                />
              </Avatar>
            }
          >
            <Text size="T400">{name}</Text>
          </MenuItem>
        </Header>
        <Box grow="Yes" style={{ overflow: 'scroll' }}>
          <Scroll visibility="Hover">
            <Box className={css.Content} direction="Column">
              {mEvents.map((mEvent) => {
                if (!mEvent.event.sender) return <div />;
                const EventContent = mEvent.getOriginalContent();
                return (
                  <>
                    <hr style={{ width: '100%', color: color.Surface.ContainerLine }} />
                    <EventItem mEvent={mEvent} EventContent={EventContent} />
                  </>
                );
              })}
            </Box>
          </Scroll>
        </Box>
      </Box>
    );
  }
);
