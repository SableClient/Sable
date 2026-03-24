import { ReactNode } from 'react';
import type { IconProps } from '@phosphor-icons/react';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { AtIcon } from '@phosphor-icons/react/dist/csr/At';
import { SignOutIcon } from '@phosphor-icons/react/dist/csr/SignOut';
import { UserIcon } from '@phosphor-icons/react/dist/csr/User';
import { EnvelopeSimpleIcon } from '@phosphor-icons/react/dist/csr/EnvelopeSimple';
import { UserPlusIcon } from '@phosphor-icons/react/dist/csr/UserPlus';
import { MatrixEvent, Room } from '$types/matrix-sdk';
import { IMemberContent, Membership } from '$types/matrix/room';
import { getMxIdLocalPart } from '$utils/matrix';
import { isMembershipChanged } from '$utils/room';
import { Text } from 'folds';
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
  return (
    <Text truncate>
      <b style={{ color, font }}>{userName ?? userId} </b>
    </Text>
  );
}

export type ParsedResult = {
  icon: React.ComponentType<IconProps>;
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
        icon: UserIcon,
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
            icon: UserPlusIcon,
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
          icon: UserPlusIcon,
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

      if (content.membership === Membership.Knock) {
        return {
          icon: EnvelopeSimpleIcon,
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

      if (content.membership === Membership.Join) {
        return {
          icon: ArrowRightIcon,
          body: (
            <>
              <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
              <Text>{' joined the room'}</Text>
            </>
          ),
        };
      }

      if (content.membership === Membership.Leave) {
        if (prevContent.membership === Membership.Invite) {
          return {
            icon: SignOutIcon,
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

        if (prevContent.membership === Membership.Knock) {
          return {
            icon: SignOutIcon,
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

        if (prevContent.membership === Membership.Ban) {
          return {
            icon: ArrowLeftIcon,
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
          icon: ArrowLeftIcon,
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

      if (content.membership === Membership.Ban) {
        return {
          icon: ArrowLeftIcon,
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
        icon: AtIcon,
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
        icon: UserIcon,
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
      icon: UserIcon,
      body: 'Membership event with no changes',
    };
  };

  return parseMemberEvent;
};
