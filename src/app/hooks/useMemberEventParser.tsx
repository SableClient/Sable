import { ReactNode } from 'react';
import { IconSrc, Icons } from 'folds';
import { MatrixEvent, Room } from '$types/matrix-sdk';
import { IMemberContent, Membership } from '$types/matrix/room';
import { getMxIdLocalPart } from '$utils/matrix';
import { isMembershipChanged } from '$utils/room';
import { useSableCosmetics } from './useSableCosmetics';
import { useMatrixClient } from './useMatrixClient';

type DecoratedUserProps = {
  roomId: string;
  userId: string;
  userName?: string;
};

function DecoratedUser({ roomId, userId, userName }: DecoratedUserProps) {
  const mx = useMatrixClient();
  const room = mx.getRoom(roomId);
  const { color, font } = useSableCosmetics(userId, room ?? ({} as Room));
  return <b style={{ color, font }}> {userName ?? userId} </b>;
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
      if (content.membership === Membership.Invite) {
        if (prevContent.membership === Membership.Knock) {
          return {
            icon: Icons.ArrowGoRightPlus,
            body: (
              <>
                <DecoratedUser roomId={roomId ?? ''} userId={senderId} userName={senderName} />
                {' accepted '}
                <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
                {`'s join request `}
                {reason}
              </>
            ),
          };
        }

        return {
          icon: Icons.ArrowGoRightPlus,
          body: (
            <>
              <DecoratedUser roomId={roomId ?? ''} userId={senderId} userName={senderName} />
              {' invited '}
              <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
              {reason}
            </>
          ),
        };
      }

      if (content.membership === Membership.Knock) {
        return {
          icon: Icons.Mail,
          body: (
            <>
              <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
              {' requested to join room: '}
              <i>{reason}</i>
            </>
          ),
        };
      }

      if (content.membership === Membership.Join) {
        return {
          icon: Icons.ArrowGoRight,
          body: (
            <>
              <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
              {' joined the room'}
            </>
          ),
        };
      }

      if (content.membership === Membership.Leave) {
        if (prevContent.membership === Membership.Invite) {
          return {
            icon: Icons.ArrowGoRightCross,
            body:
              senderId === userId ? (
                <>
                  <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
                  {' rejected the invitation '}
                  {reason}
                </>
              ) : (
                <>
                  <DecoratedUser roomId={roomId ?? ''} userId={senderId} userName={senderName} />
                  {' rejected '}
                  <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
                  {`'s join request `}
                  {reason}
                </>
              ),
          };
        }

        if (prevContent.membership === Membership.Knock) {
          return {
            icon: Icons.ArrowGoRightCross,
            body:
              senderId === userId ? (
                <>
                  <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
                  {' revoked joined request '}
                  {reason}
                </>
              ) : (
                <>
                  <DecoratedUser roomId={roomId ?? ''} userId={senderId} userName={senderName} />
                  {' revoked '}
                  <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
                  {`'s invite `}
                  {reason}
                </>
              ),
          };
        }

        if (prevContent.membership === Membership.Ban) {
          return {
            icon: Icons.ArrowGoLeft,
            body: (
              <>
                <DecoratedUser roomId={roomId ?? ''} userId={senderId} userName={senderName} />
                {' unbanned '}
                <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
                {reason}
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
                {' left the room '}
                {reason}
              </>
            ) : (
              <>
                <DecoratedUser roomId={roomId ?? ''} userId={senderId} userName={senderName} />
                {' kicked '}
                <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
                {reason}
              </>
            ),
        };
      }

      if (content.membership === Membership.Ban) {
        return {
          icon: Icons.ArrowGoLeft,
          body: (
            <>
              <DecoratedUser roomId={roomId ?? ''} userId={senderId} userName={senderName} />
              {' banned '}
              <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
              {reason}
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
              {' changed display name to '}
              <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
            </>
          ) : (
            <>
              <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={prevUserName} />
              {' removed their display name '}
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
              {' changed their avatar'}
            </>
          ) : (
            <>
              <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
              {' removed their avatar '}
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
