import { ReactNode } from 'react';
import type { IconProps } from '@phosphor-icons/react';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { AtIcon } from '@phosphor-icons/react/dist/csr/At';
import { SignOutIcon } from '@phosphor-icons/react/dist/csr/SignOut';
import { UserIcon } from '@phosphor-icons/react/dist/csr/User';
import { UserPlusIcon } from '@phosphor-icons/react/dist/csr/UserPlus';
import { MatrixEvent } from '$types/matrix-sdk';
import { IMemberContent, Membership } from '$types/matrix/room';
import { getMxIdLocalPart } from '$utils/matrix';
import { isMembershipChanged } from '$utils/room';

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
                <b>{senderName}</b>
                {' accepted '}
                <b>{userName}</b>
                {`'s join request `}
                {reason}
              </>
            ),
          };
        }

        return {
          icon: UserPlusIcon,
          body: (
            <>
              <b>{senderName}</b>
              {' invited '}
              <b>{userName}</b> {reason}
            </>
          ),
        };
      }

      if (content.membership === Membership.Knock) {
        return {
          icon: UserPlusIcon,
          body: (
            <>
              <b>{userName}</b>
              {' request to join room '}
              {reason}
            </>
          ),
        };
      }

      if (content.membership === Membership.Join) {
        return {
          icon: ArrowRightIcon,
          body: (
            <>
              <b>{userName}</b>
              {' joined the room'}
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
                  <b>{userName}</b>
                  {' rejected the invitation '}
                  {reason}
                </>
              ) : (
                <>
                  <b>{senderName}</b>
                  {' rejected '}
                  <b>{userName}</b>
                  {`'s join request `}
                  {reason}
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
                  <b>{userName}</b>
                  {' revoked joined request '}
                  {reason}
                </>
              ) : (
                <>
                  <b>{senderName}</b>
                  {' revoked '}
                  <b>{userName}</b>
                  {`'s invite `}
                  {reason}
                </>
              ),
          };
        }

        if (prevContent.membership === Membership.Ban) {
          return {
            icon: ArrowLeftIcon,
            body: (
              <>
                <b>{senderName}</b>
                {' unbanned '}
                <b>{userName}</b> {reason}
              </>
            ),
          };
        }

        return {
          icon: ArrowLeftIcon,
          body:
            senderId === userId ? (
              <>
                <b>{userName}</b>
                {' left the room '}
                {reason}
              </>
            ) : (
              <>
                <b>{senderName}</b>
                {' kicked '}
                <b>{userName}</b> {reason}
              </>
            ),
        };
      }

      if (content.membership === Membership.Ban) {
        return {
          icon: ArrowLeftIcon,
          body: (
            <>
              <b>{senderName}</b>
              {' banned '}
              <b>{userName}</b> {reason}
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
              <b>{prevUserName}</b>
              {' changed display name to '}
              <b>{userName}</b>
            </>
          ) : (
            <>
              <b>{prevUserName}</b>
              {' removed their display name '}
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
              <b>{userName}</b>
              {' changed their avatar'}
            </>
          ) : (
            <>
              <b>{userName}</b>
              {' removed their avatar '}
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
