import type { MouseEventHandler, ReactNode } from 'react';
import { useCallback } from 'react';
import { Text } from 'folds';
import type { MatrixEvent, Room } from '$types/matrix-sdk';
import {
  At,
  EnvelopeSimple,
  PaintBrush,
  SignIn,
  SignOut,
  timelineIcon,
  User,
  UserMinus,
  UserPlus,
} from '$components/icons/phosphor';

import { getMxIdLocalPart } from '$utils/matrix';
import { isMembershipChanged } from '$utils/room/relations';
import { useOpenUserRoomProfile } from '$state/hooks/userRoomProfile';
import { useSableCosmetics } from './useSableCosmetics';
import { useMatrixClient } from './useMatrixClient';
import { KnownMembership } from '$types/matrix-sdk';
import type { CustomRoomMemberEventContent } from '$unstable/CustomRoomMemberEventContent';
import { MATRIX_UNSTABLE_COLORS } from '$unstable/prefixes';

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
      openUserRoomProfile(
        roomId,
        undefined,
        userId,
        undefined,
        evt.currentTarget.getBoundingClientRect()
      );
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
  icon: ReactNode;
  body: ReactNode;
};

export type MemberEventParser = (mEvent: MatrixEvent) => ParsedResult;

const parseMemberEvent: MemberEventParser = (mEvent) => {
  const content = mEvent.getContent<CustomRoomMemberEventContent>();
  const prevContent = mEvent.getPrevContent() as CustomRoomMemberEventContent;
  const senderId = mEvent.getSender();
  const userId = mEvent.getStateKey();
  const roomId = mEvent.getRoomId();
  const reason = typeof content.reason === 'string' ? content.reason : undefined;

  if (!senderId || !userId)
    return {
      icon: timelineIcon(User),
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
          icon: timelineIcon(UserPlus),
          body: (
            <>
              <DecoratedUser roomId={roomId ?? ''} userId={senderId} userName={senderName} />
              <Text>{' accepted '}</Text>
              <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
              <Text>{`'s join request`}</Text>
              <Text>{reason ? `(${reason})` : null}</Text>
            </>
          ),
        };
      }

      return {
        icon: timelineIcon(UserPlus),
        body: (
          <>
            <DecoratedUser roomId={roomId ?? ''} userId={senderId} userName={senderName} />
            <Text>{' invited '}</Text>
            <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
            <Text>{reason ? `(${reason})` : null}</Text>
          </>
        ),
      };
    }

    if (content.membership === KnownMembership.Knock) {
      return {
        icon: timelineIcon(EnvelopeSimple),
        body: (
          <>
            <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
            <Text>{' requested to join room'}</Text>
            <Text>{reason ? `(${reason})` : null}</Text>
          </>
        ),
      };
    }

    if (content.membership === KnownMembership.Join) {
      return {
        icon: timelineIcon(SignIn),
        body: (
          <>
            <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
            <Text>{' joined the room'}</Text>
            <Text>{reason ? `(${reason})` : null}</Text>
          </>
        ),
      };
    }

    if (content.membership === KnownMembership.Leave) {
      if (prevContent.membership === KnownMembership.Invite) {
        return {
          icon: timelineIcon(UserMinus),
          body:
            senderId === userId ? (
              <>
                <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
                <Text>{' rejected the invitation'}</Text>
                <Text>{reason ? `(${reason})` : null}</Text>
              </>
            ) : (
              <>
                <DecoratedUser roomId={roomId ?? ''} userId={senderId} userName={senderName} />
                <Text>{' rejected '}</Text>
                <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
                <Text>{`'s join request`}</Text>
                <Text>{reason ? `(${reason})` : null}</Text>
              </>
            ),
        };
      }

      if (prevContent.membership === KnownMembership.Knock) {
        return {
          icon: timelineIcon(UserMinus),
          body:
            senderId === userId ? (
              <>
                <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
                <Text>{' revoked joined request'}</Text>
                <Text>{reason ? `(${reason})` : null}</Text>
              </>
            ) : (
              <>
                <DecoratedUser roomId={roomId ?? ''} userId={senderId} userName={senderName} />
                {' revoked '}
                <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
                <Text>{`'s invite`}</Text>
                <Text>{reason ? `(${reason})` : null}</Text>
              </>
            ),
        };
      }

      if (prevContent.membership === KnownMembership.Ban) {
        return {
          icon: timelineIcon(SignOut),
          body: (
            <>
              <DecoratedUser roomId={roomId ?? ''} userId={senderId} userName={senderName} />
              <Text>{' unbanned '}</Text>
              <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
              <Text>{reason ? `(${reason})` : null}</Text>
            </>
          ),
        };
      }

      return {
        icon: timelineIcon(SignOut),
        body:
          senderId === userId ? (
            <>
              <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
              <Text>{' left the room '}</Text>
              <Text>{reason ? `(${reason})` : null}</Text>
            </>
          ) : (
            <>
              <DecoratedUser roomId={roomId ?? ''} userId={senderId} userName={senderName} />
              <Text>{' kicked '}</Text>
              <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
              <Text>{reason ? `(${reason})` : null}</Text>
            </>
          ),
      };
    }

    if (content.membership === KnownMembership.Ban) {
      return {
        icon: timelineIcon(SignOut),
        body: (
          <>
            <DecoratedUser roomId={roomId ?? ''} userId={senderId} userName={senderName} />
            <Text>{' banned '}</Text>
            <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
            <Text>{reason ? `(${reason})` : null}</Text>
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
      icon: timelineIcon(At),
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
            <Text>{' removed their display name'}</Text>
          </>
        ),
    };
  }
  if (content.avatar_url !== prevContent.avatar_url) {
    return {
      icon: timelineIcon(User),
      body:
        content.avatar_url && typeof content.avatar_url === 'string' ? (
          <>
            <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
            <Text>{' changed their avatar'}</Text>
          </>
        ) : (
          <>
            <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
            <Text>{' removed their avatar'}</Text>
          </>
        ),
    };
  }
  if (content[MATRIX_UNSTABLE_COLORS]?.on_dark !== prevContent[MATRIX_UNSTABLE_COLORS]?.on_dark) {
    return {
      icon: timelineIcon(PaintBrush),
      body:
        content[MATRIX_UNSTABLE_COLORS]?.on_dark &&
        typeof content[MATRIX_UNSTABLE_COLORS]?.on_dark === 'string' ? (
          <>
            <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
            <Text>{' changed one of their room name colors'}</Text>
          </>
        ) : (
          <>
            <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
            <Text>{' removed one of their room name colors '}</Text>
          </>
        ),
    };
  }
  if (content[MATRIX_UNSTABLE_COLORS]?.on_light !== prevContent[MATRIX_UNSTABLE_COLORS]?.on_light) {
    return {
      icon: timelineIcon(PaintBrush),
      body:
        content[MATRIX_UNSTABLE_COLORS]?.on_light &&
        typeof content[MATRIX_UNSTABLE_COLORS]?.on_light === 'string' ? (
          <>
            <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
            <Text>{' changed one of their room name colors'}</Text>
          </>
        ) : (
          <>
            <DecoratedUser roomId={roomId ?? ''} userId={userId} userName={userName} />
            <Text>{' removed one of their room name colors '}</Text>
          </>
        ),
    };
  }

  return {
    icon: timelineIcon(User),
    body: 'Membership event with no changes',
  };
};

export const useMemberEventParser = (): MemberEventParser => parseMemberEvent;
