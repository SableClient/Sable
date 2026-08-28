export type DirectRoomMember = {
  userId: string;
  membership?: string;
};

type ResolveDmOtherMemberInput<Member extends DirectRoomMember> = {
  currentUserId: string | null;
  directMembers: Member[];
  members: Member[];
  functionalMemberIds: string[];
  fallbackMember?: Member;
};

export const isFunctionalMember = (
  member: DirectRoomMember,
  functionalMemberIds: readonly string[]
): boolean => functionalMemberIds.includes(member.userId);

const isActiveMember = (member: DirectRoomMember): boolean =>
  member.membership === 'join' || member.membership === 'invite';

export const resolveDmOtherMember = <Member extends DirectRoomMember>({
  currentUserId,
  directMembers,
  members,
  functionalMemberIds,
  fallbackMember,
}: ResolveDmOtherMemberInput<Member>): Member | undefined => {
  const isFunctional = (member: DirectRoomMember) =>
    isFunctionalMember(member, functionalMemberIds);

  const directMember = directMembers.filter((member) => !isFunctional(member));
  if (directMember.length === 1 && isActiveMember(directMember[0]!)) return directMember[0];

  const otherMembers = members.filter(
    (member) => member.userId !== currentUserId && !isFunctional(member) && isActiveMember(member)
  );
  if (otherMembers.length === 1) return otherMembers[0];

  return fallbackMember && !isFunctional(fallbackMember) ? fallbackMember : undefined;
};
