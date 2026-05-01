import type { MemberPowerTag } from '$types/matrix/room';

const DEFAULT_TAG: MemberPowerTag = {
  name: 'Founder',
  color: '#0000ff',
};

export const useRoomCreatorsTag = (): MemberPowerTag => DEFAULT_TAG;
