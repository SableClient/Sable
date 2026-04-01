import { Avatar, Box, Chip, Text, config } from 'folds';
import type { Thread } from 'matrix-js-sdk/lib/models/thread';
import { useAtomValue } from 'jotai';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { getMemberAvatarMxc, getMemberDisplayName } from '$utils/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { UserAvatar } from '$components/user-avatar';
import { nicknamesAtom } from '$state/nicknames';
import type { ThreadRootItemProps } from '$features/room/ThreadRootItem';
import { ThreadRootItem } from '$features/room/ThreadRootItem';
import { getThreadReplyEvents } from '$features/room/ThreadDrawer';
import * as css from './ForumView.css';

type ForumThreadItemProps = ThreadRootItemProps & {
  thread?: Thread;
  onClick: (eventId: string) => void;
};

export function ForumThreadItem({ thread, onClick, ...rootProps }: ForumThreadItemProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const nicknames = useAtomValue(nicknamesAtom);
  const { room, mEvent } = rootProps;

  const mEventId = mEvent.getId();

  // Thread reply info for the chip — uses the same reply resolution as the thread drawer.
  const replies = mEventId ? getThreadReplyEvents(room, mEventId) : [];
  const replyCount = replies.length;

  const uniqueSenders = thread
    ? [...new Set(replies.map((ev) => ev.getSender()).filter((id): id is string => !!id))]
    : [];

  const lastReply = replies.at(-1);
  const lastSenderId = lastReply?.getSender() ?? '';
  const lastDisplayName =
    getMemberDisplayName(room, lastSenderId, nicknames) ??
    getMxIdLocalPart(lastSenderId) ??
    lastSenderId;
  const lastContent = lastReply?.getContent();
  const lastBody: string = typeof lastContent?.body === 'string' ? lastContent.body : '';

  if (!mEventId) return null;

  const handleCardClick = (evt: React.MouseEvent) => {
    // Don't open thread if the click originated from a button, link, or other interactive element
    const target = evt.target as HTMLElement;
    if (target.closest('button, a, [role="button"]')) return;
    onClick(mEventId);
  };

  return (
    <Box
      className={css.ForumThreadItem}
      direction="Row"
      alignItems="Center"
      onClick={handleCardClick}
      style={{ marginTop: config.space.S200 }}
    >
      <Box direction="Column" grow="Yes" style={{ minWidth: 0 }}>
        <ThreadRootItem {...rootProps} thread={thread} hideReplyButton />

        {/* Thread reply chip */}
        <Box style={{ paddingLeft: config.space.S700, paddingTop: config.space.S100 }}>
          <Chip
            as="button"
            style={{ alignSelf: 'flex-start' }}
            size="400"
            variant="SurfaceVariant"
            radii="300"
            onClick={(evt: React.MouseEvent) => {
              evt.stopPropagation();
              onClick(mEventId);
            }}
            before={
              uniqueSenders.length > 0 ? (
                <Box alignItems="Center" style={{ gap: 0 }}>
                  {uniqueSenders.slice(0, 3).map((sid, index) => {
                    const avatarMxc = getMemberAvatarMxc(room, sid);
                    const avatarUrl = avatarMxc
                      ? (mxcUrlToHttp(mx, avatarMxc, useAuthentication, 20, 20, 'crop') ??
                        undefined)
                      : undefined;
                    const dn =
                      getMemberDisplayName(room, sid, nicknames) ?? getMxIdLocalPart(sid) ?? sid;
                    return (
                      <Avatar key={sid} size="200" style={{ marginLeft: index > 0 ? '-4px' : 0 }}>
                        <UserAvatar
                          userId={sid}
                          src={avatarUrl}
                          alt={dn}
                          renderFallback={() => (
                            <span style={{ fontSize: '10px', fontWeight: 'bold', lineHeight: 1 }}>
                              {dn[0]?.toUpperCase() ?? '?'}
                            </span>
                          )}
                        />
                      </Avatar>
                    );
                  })}
                </Box>
              ) : undefined
            }
          >
            <Text size="T300" style={{ whiteSpace: 'nowrap' }}>
              {replyCount}&nbsp;{replyCount === 1 ? 'reply' : 'replies'}
            </Text>
            {lastBody && (
              <Text
                size="T300"
                style={{
                  opacity: 0.7,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                &nbsp;·&nbsp;{lastDisplayName}:&nbsp;{lastBody.slice(0, 60)}
              </Text>
            )}
          </Chip>
        </Box>
      </Box>
    </Box>
  );
}
