import { useAtomValue } from 'jotai';
import { allInvitesAtom } from '$state/room-list/inviteList';
import { useDismissedInviteList } from './useDismissedInvites';

export const useInviteCount = () => {
  const dismissedInvitesIds = useDismissedInviteList();
  const allInvites = useAtomValue(allInvitesAtom).filter(
    (invite) => !dismissedInvitesIds?.includes(invite)
  );
  return allInvites.length;
};
