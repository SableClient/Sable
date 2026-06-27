import classNames from 'classnames';
import {
  Avatar,
  Box,
  Button,
  Header,
  IconButton,
  Line,
  MenuItem,
  Scroll,
  Text,
  as,
  config,
} from 'folds';
import type { MatrixEvent, Room, RoomMember } from '$types/matrix-sdk';
import { getMemberDisplayName } from '$utils/room';
import { getMxIdLocalPart } from '$utils/matrix';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useAtomValue } from 'jotai';
import { nicknamesAtom } from '$state/nicknames';
import { UserAvatar } from '$components/user-avatar';
import { composerIcon, userFallbackIcon, X } from '$components/icons/phosphor';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useOpenUserRoomProfile } from '$state/hooks/userRoomProfile';
import { useSpaceOptionally } from '$hooks/useSpace';
import { getMouseEventCords } from '$utils/dom';
import * as css from './PollResponses.css';
import { useCallback, useEffect, useState } from 'react';
import type { PollAnswerItem } from '$components/message/PollEvent';
import { M_POLL_RESPONSE, M_TEXT } from 'matrix-js-sdk';

export type PollResponsesViewerProps = {
  room: Room;
  answers: PollAnswerItem[];
  events: MatrixEvent[];
  initialSelection: PollAnswerItem;
  onClose: () => void;
};
export const PollResponsesViewer = as<'div', PollResponsesViewerProps>(
  ({ className, room, answers, events, initialSelection, onClose, ...props }, ref) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const space = useSpaceOptionally();
    const openProfile = useOpenUserRoomProfile();
    const nicknames = useAtomValue(nicknamesAtom);
    const [selectedOption, setSelectedOption] = useState(initialSelection);
    const getVotes = useCallback(() => {
      let votes: MatrixEvent[] = [];
      events.forEach((item) => {
        const response = item.getContent()[M_POLL_RESPONSE.name];
        const selections = response?.answers;
        if (selections.includes(selectedOption.id) && item.event.sender) votes.push(item);
      });
      return votes;
    }, [selectedOption, events]);
    const [votes, setVotes] = useState(getVotes());
    useEffect(() => {
      setSelectedOption(initialSelection);
    }, [initialSelection]);
    useEffect(() => {
      setVotes(getVotes());
    }, [getVotes]);

    if (answers.length < 1 || !initialSelection) return <></>;

    const getName = (member: RoomMember) =>
      getMemberDisplayName(room, member.userId, nicknames) ??
      getMxIdLocalPart(member.userId) ??
      member.userId;

    return (
      <Box
        className={classNames(css.ReactionViewer, className)}
        direction="Row"
        {...props}
        ref={ref}
      >
        <Box shrink="No" className={css.Sidebar}>
          <Scroll visibility="Hover" hideTrack size="300">
            <Box className={css.SidebarContent} grow="Yes" direction="Column" gap="200">
              {answers.map((item) => (
                <Button
                  variant="Secondary"
                  style={{
                    maxWidth: '100%',
                    flexShrink: '1',
                  }}
                  key={item.id}
                  onClick={() => setSelectedOption(item)}
                >
                  <Text truncate>{item[M_TEXT.name]}</Text>
                </Button>
              ))}
            </Box>
          </Scroll>
        </Box>
        <Line variant="Surface" direction="Vertical" size="300" />
        <Box grow="Yes" direction="Column">
          <Header className={css.Header} variant="Surface" size="600">
            <Box grow="Yes">
              <Text size="H3" truncate>
                {votes.length > 0
                  ? `'${selectedOption[M_TEXT.name]}' voters:`
                  : `Nobody has voted for '${selectedOption[M_TEXT.name]}' yet`}
              </Text>
            </Box>
            <IconButton size="300" onClick={onClose}>
              {composerIcon(X)}
            </IconButton>
          </Header>

          <Box grow="Yes">
            <Scroll visibility="Hover" hideTrack size="300">
              <Box className={css.Content} direction="Column">
                {votes.map((mEvent) => {
                  const senderId = mEvent.getSender();
                  if (!senderId) return null;
                  const member = room.getMember(senderId);
                  const name = (member ? getName(member) : getMxIdLocalPart(senderId)) ?? senderId;

                  const avatarMxcUrl = member?.getMxcAvatarUrl();
                  const avatarUrl = avatarMxcUrl
                    ? mx.mxcUrlToHttp(
                        avatarMxcUrl,
                        100,
                        100,
                        'crop',
                        undefined,
                        false,
                        useAuthentication
                      )
                    : undefined;

                  return (
                    <MenuItem
                      key={senderId}
                      style={{ padding: `0 ${config.space.S200}` }}
                      radii="400"
                      onClick={(event) => {
                        openProfile(
                          room.roomId,
                          space?.roomId,
                          senderId,
                          getMouseEventCords(event.nativeEvent),
                          'Bottom'
                        );
                      }}
                      before={
                        <Avatar size="200">
                          <UserAvatar
                            userId={senderId}
                            src={avatarUrl ?? undefined}
                            alt={name}
                            renderFallback={() => userFallbackIcon('sm')}
                          />
                        </Avatar>
                      }
                    >
                      <Box grow="Yes">
                        <Text size="T400" truncate>
                          {name}
                        </Text>
                      </Box>
                    </MenuItem>
                  );
                })}
              </Box>
            </Scroll>
          </Box>
        </Box>
      </Box>
    );
  }
);
