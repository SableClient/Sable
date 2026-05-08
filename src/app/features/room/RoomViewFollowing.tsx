import { useAtomValue } from 'jotai';
import { Box, Icon, Icons, Text, as, config } from 'folds';
import type { Room } from '$types/matrix-sdk';
import classNames from 'classnames';
import { useAtom } from 'jotai';

import { getMemberDisplayName } from '$utils/room';
import { getMxIdLocalPart } from '$utils/matrix';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useRoomLatestRenderedEvent } from '$hooks/useRoomLatestRenderedEvent';
import { useRoomEventReaders } from '$hooks/useRoomEventReaders';
import { modalAtom, ModalType } from '$state/modal';
import { nicknamesAtom } from '$state/nicknames';
import * as css from './RoomViewFollowing.css';

export function RoomViewFollowingPlaceholder() {
  return <div className={css.RoomViewFollowingPlaceholder} />;
}

export type RoomViewFollowingProps = {
  room: Room;
  threadEventId?: string;
  participantIds?: Set<string>;
};
export const RoomViewFollowing = as<'div', RoomViewFollowingProps>(
  ({ className, room, threadEventId, participantIds, ...props }, ref) => {
    const mx = useMatrixClient();
    const [, setModal] = useAtom(modalAtom);
    const latestEvent = useRoomLatestRenderedEvent(room);
    const resolvedEventId = threadEventId ?? latestEvent?.getId();
    const latestEventReaders = useRoomEventReaders(room, resolvedEventId);
    const nicknames = useAtomValue(nicknamesAtom);
    const names = latestEventReaders
      .filter((readerId) => readerId !== mx.getUserId())
      .filter((readerId) => !participantIds || participantIds.has(readerId))
      .map(
        (readerId) =>
          getMemberDisplayName(room, readerId, nicknames) ?? getMxIdLocalPart(readerId) ?? readerId
      );

    const eventId = resolvedEventId;

    return (
      <Box
        as={names.length > 0 ? 'button' : 'div'}
        onClick={
          names.length > 0
            ? () => {
                if (eventId) {
                  setModal({ type: ModalType.ReadReceipts, room, eventId });
                }
              }
            : undefined
        }
        className={classNames(css.RoomViewFollowing({ clickable: names.length > 0 }), className)}
        alignItems="Center"
        justifyContent="End"
        gap="200"
        {...props}
        ref={ref}
      >
        {names.length > 0 && (
          <>
            <Icon style={{ opacity: config.opacity.P300 }} size="100" src={Icons.CheckTwice} />
            <Text size="T300" truncate>
              {names.length === 1 && (
                <>
                  <b style={{ WebkitTextFillColor: 'inherit' }}>{names[0]}</b>
                  <Text
                    as="span"
                    size="Inherit"
                    priority="300"
                    style={{ WebkitTextFillColor: 'currentColor' }}
                  >
                    {' is following the conversation.'}
                  </Text>
                </>
              )}
              {names.length === 2 && (
                <>
                  <b style={{ WebkitTextFillColor: 'inherit' }}>{names[0]}</b>
                  <Text
                    as="span"
                    size="Inherit"
                    priority="300"
                    style={{ WebkitTextFillColor: 'currentColor' }}
                  >
                    {' and '}
                  </Text>
                  <b style={{ WebkitTextFillColor: 'inherit' }}>{names[1]}</b>
                  <Text
                    as="span"
                    size="Inherit"
                    priority="300"
                    style={{ WebkitTextFillColor: 'currentColor' }}
                  >
                    {' are following the conversation.'}
                  </Text>
                </>
              )}
              {names.length === 3 && (
                <>
                  <b style={{ WebkitTextFillColor: 'inherit' }}>{names[0]}</b>
                  <Text
                    as="span"
                    size="Inherit"
                    priority="300"
                    style={{ WebkitTextFillColor: 'currentColor' }}
                  >
                    {', '}
                  </Text>
                  <b style={{ WebkitTextFillColor: 'inherit' }}>{names[1]}</b>
                  <Text
                    as="span"
                    size="Inherit"
                    priority="300"
                    style={{ WebkitTextFillColor: 'currentColor' }}
                  >
                    {' and '}
                  </Text>
                  <b style={{ WebkitTextFillColor: 'inherit' }}>{names[2]}</b>
                  <Text
                    as="span"
                    size="Inherit"
                    priority="300"
                    style={{ WebkitTextFillColor: 'currentColor' }}
                  >
                    {' are following the conversation.'}
                  </Text>
                </>
              )}
              {names.length > 3 && (
                <>
                  <b style={{ WebkitTextFillColor: 'inherit' }}>{names[0]}</b>
                  <Text
                    as="span"
                    size="Inherit"
                    priority="300"
                    style={{ WebkitTextFillColor: 'currentColor' }}
                  >
                    {', '}
                  </Text>
                  <b style={{ WebkitTextFillColor: 'inherit' }}>{names[1]}</b>
                  <Text
                    as="span"
                    size="Inherit"
                    priority="300"
                    style={{ WebkitTextFillColor: 'currentColor' }}
                  >
                    {', '}
                  </Text>
                  <b style={{ WebkitTextFillColor: 'inherit' }}>{names[2]}</b>
                  <Text
                    as="span"
                    size="Inherit"
                    priority="300"
                    style={{ WebkitTextFillColor: 'currentColor' }}
                  >
                    {' and '}
                  </Text>
                  <b style={{ WebkitTextFillColor: 'inherit' }}>{names.length - 3} others</b>
                  <Text
                    as="span"
                    size="Inherit"
                    priority="300"
                    style={{ WebkitTextFillColor: 'currentColor' }}
                  >
                    {' are following the conversation.'}
                  </Text>
                </>
              )}
            </Text>
          </>
        )}
      </Box>
    );
  }
);
