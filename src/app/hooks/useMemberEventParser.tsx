import type { MouseEventHandler, ReactNode } from 'react';
import { useCallback } from 'react';
import type { IconSrc } from 'folds';
import { Icons, Text } from 'folds';
import type { MatrixEvent, Room } from '$types/matrix-sdk';
import type { IMemberContent } from '$types/matrix/room';

import { getMxIdLocalPart } from '$utils/matrix';
import { isMembershipChanged } from '$utils/room';
import { useOpenUserRoomProfile } from '$state/hooks/userRoomProfile';
import { useSableCosmetics } from './useSableCosmetics';
import { useMatrixClient } from './useMatrixClient';
import { KnownMembership } from '$types/matrix-sdk';

type DecoratedUserProps = {
  roomId: string;
  userId: string;
  userName?: string;
};

function DecoratedUser({ roomId, userId, userName }: DecoratedUserProps) {
  const mx = useMatrixClient();
  const room = mx.getRoom(roomId);
  const { color, font } = useSableCosmetics(userId, room ?? ({} as Room));

  const openUserRoomProfile = useOpenUserRoomProfile();
  const handleUserClick: MouseEventHandler = useCallback(
    (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      openUserRoomProfile(roomId, undefined, userId, evt.currentTarget.getBoundingClientRect());
    },
    [roomId, userId, openUserRoomProfile]
  );

  return (
    <Text as="a" onClick={handleUserClick} truncate>
      <b style={{ color, font }}>{userName ?? userId} </b>
    </Text>
  );
}

export type ParsedResult = {
  icon: IconSrc;
  body: ReactNode;
};

export type MemberEventParser = (mEvent: MatrixEvent) => ParsedResult;

export const useMemberEventParser = (): MemberEventParser => {
  const parseMemberEvent: MemberEventParser = (mEvent) => {
    const content = mEvent.getContent<IMemberContent>();
    const prevContent = mEvent.getPrevContent() as IMemberContent;
    const senderId = mEvent.getSender();
    const userId = mEvent.getStateKey();
    const roomId = mEvent.getRoomId();
    const reason = typeof content.reason === 'string' ? content.reason : undefined;

    if (!senderId || !userId)
      return {
        icon: Icons.User,
        body: 'Broken membership event',
      };

    const senderName = getMxIdLocalPart(senderId);
    const userName =
      typeof content.displayname === 'string'
        ? content.displayname || getMxIdLocalPart(userId)
        : getMxIdLocalPart(userId);

    if (isMembershipChanged(mEvent)) {
      if (content.membership === KnownMembership.Invite) {
        if (prevContent.membership === KnownMembership.Knock) {
          return {
            icon: Icons.ArrowGoRightPlus,
            body: (
              <>
                <DecoratedUser roomId={roomId ?? ''} userId={senderId} userName={senderName} />
                <Text>{' accepted '}</Text>
                <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
                <Text>
                  {`'s join request `}
                  {reason}
                </Text>
              </>
            ),
          };
        }

        return {
          icon: Icons.ArrowGoRightPlus,
          body: (
            <>
              <DecoratedUser roomId={roomId ?? ''} userId={senderId} userName={senderName} />
              <Text>{' invited '}</Text>
              <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
              <Text>{reason}</Text>
            </>
          ),
        };
      }

      if (content.membership === KnownMembership.Knock) {
        return {
          icon: Icons.Mail,
          body: (
            <>
              <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
              <Text>
                {' requested to join room: '}
                <i>{reason}</i>
              </Text>
            </>
          ),
        };
      }

      if (content.membership === KnownMembership.Join) {
        return {
          icon: Icons.ArrowGoRight,
          body: (
            <>
              <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
              <Text>{' joined the room'}</Text>
            </>
          ),
        };
      }

      if (content.membership === KnownMembership.Leave) {
        if (prevContent.membership === KnownMembership.Invite) {
          return {
            icon: Icons.ArrowGoRightCross,
            body:
              senderId === userId ? (
                <>
                  <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
                  <Text>
                    {' rejected the invitation '}
                    {reason}
                  </Text>
                </>
              ) : (
                <>
                  <DecoratedUser roomId={roomId ?? ''} userId={senderId} userName={senderName} />
                  <Text>{' rejected '}</Text>
                  <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
                  <Text>
                    {`'s join request `}
                    {reason}
                  </Text>
                </>
              ),
          };
        }

        if (prevContent.membership === KnownMembership.Knock) {
          return {
            icon: Icons.ArrowGoRightCross,
            body:
              senderId === userId ? (
                <>
                  <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
                  <Text>
                    {' revoked joined request '}
                    {reason}
                  </Text>
                </>
              ) : (
                <>
                  <DecoratedUser roomId={roomId ?? ''} userId={senderId} userName={senderName} />
                  {' revoked '}
                  <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
                  <Text>
                    {`'s invite `}
                    {reason}
                  </Text>
                </>
              ),
          };
        }

        if (prevContent.membership === KnownMembership.Ban) {
          return {
            icon: Icons.ArrowGoLeft,
            body: (
              <>
                <DecoratedUser roomId={roomId ?? ''} userId={senderId} userName={senderName} />
                <Text>{' unbanned '}</Text>
                <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
                <Text>{reason}</Text>
              </>
            ),
          };
        }

        return {
          icon: Icons.ArrowGoLeft,
          body:
            senderId === userId ? (
              <>
                <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
                <Text>
                  {' left the room '}
                  {reason}
                </Text>
              </>
            ) : (
              <>
                <DecoratedUser roomId={roomId ?? ''} userId={senderId} userName={senderName} />
                <Text>{' kicked '}</Text>
                <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
                <Text>{reason}</Text>
              </>
            ),
        };
      }

      if (content.membership === KnownMembership.Ban) {
        return {
          icon: Icons.ArrowGoLeft,
          body: (
            <>
              <DecoratedUser roomId={roomId ?? ''} userId={senderId} userName={senderName} />
              <Text>{' banned '}</Text>
              <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
              <Text>{reason}</Text>
            </>
          ),
        };
      }
    }

    if (content.displayname !== prevContent.displayname) {
      const prevUserName =
        typeof prevContent.displayname === 'string'
          ? prevContent.displayname || getMxIdLocalPart(userId)
          : getMxIdLocalPart(userId);

      return {
        icon: Icons.Mention,
        body:
          typeof content.displayname === 'string' ? (
            <>
              <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={prevUserName} />
              <Text>{' changed display name to '}</Text>
              <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
            </>
          ) : (
            <>
              <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={prevUserName} />
              <Text>{' removed their display name '}</Text>
            </>
          ),
      };
    }
    if (content.avatar_url !== prevContent.avatar_url) {
      return {
        icon: Icons.User,
        body:
          content.avatar_url && typeof content.avatar_url === 'string' ? (
            <>
              <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
              <Text>{' changed their avatar'}</Text>
            </>
          ) : (
            <>
              <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
              <Text>{' removed their avatar '}</Text>
            </>
          ),
      };
    }

    return {
      icon: Icons.User,
      body: 'Membership event with no changes',
    };
  };

  return parseMemberEvent;
};
