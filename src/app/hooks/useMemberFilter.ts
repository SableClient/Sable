import { useMemo } from 'react';
import type { RoomMember } from '$types/matrix-sdk';
import { KnownMembership } from '$types/matrix-sdk';

export const MembershipFilter = {
  filterJoined: (m: RoomMember) => m.membership === KnownMembership.Join,
  filterInvited: (m: RoomMember) => m.membership === KnownMembership.Invite,
  filterLeaved: (m: RoomMember) =>
    m.membership === KnownMembership.Leave &&
    m.events.member?.getStateKey() === m.events.member?.getSender(),
  filterKicked: (m: RoomMember) =>
    m.membership === KnownMembership.Leave &&
    m.events.member?.getStateKey() !== m.events.member?.getSender(),
  filterBanned: (m: RoomMember) => m.membership === KnownMembership.Ban,
};

export type MembershipFilterFn = (m: RoomMember) => boolean;

export type MembershipFilterItem = {
  name: string;
  filterFn: MembershipFilterFn;
};

export const useMembershipFilterMenu = (): MembershipFilterItem[] =>
  useMemo(
    () => [
      {
        name: 'Joined',
        filterFn: MembershipFilter.filterJoined,
      },
      {
        name: 'Invited',
        filterFn: MembershipFilter.filterInvited,
      },
      {
        name: 'Left',
        filterFn: MembershipFilter.filterLeaved,
      },
      {
        name: 'Kicked',
        filterFn: MembershipFilter.filterKicked,
      },
      {
        name: 'Banned',
        filterFn: MembershipFilter.filterBanned,
      },
    ],
    []
  );

export const useMembershipFilter = (
  index: number,
  membershipFilter: MembershipFilterItem[]
): MembershipFilterItem => {
  const filter = membershipFilter[index] ?? membershipFilter[0];
  if (!filter) {
    return {
      name: 'Joined',
      filterFn: MembershipFilter.filterJoined,
    };
  }
  return filter;
};
