export type MatrixRtcMembershipFixture = {
  userId: string;
  sender: string;
  deviceId: string;
  expiresTs: number;
};

const BASE_TS = 1_700_000_000_000;

export const matrixRtcMembershipFixtures = {
  noMembers: [] as MatrixRtcMembershipFixture[],
  remoteOnly: [
    {
      userId: '@remote:example.org',
      sender: '@remote:example.org',
      deviceId: 'REMOTE_DEVICE',
      expiresTs: BASE_TS + 60_000,
    },
  ] as MatrixRtcMembershipFixture[],
  selfOnly: [
    {
      userId: '@self:example.org',
      sender: '@self:example.org',
      deviceId: 'SELF_DEVICE',
      expiresTs: BASE_TS + 60_000,
    },
  ] as MatrixRtcMembershipFixture[],
  selfAndRemote: [
    {
      userId: '@self:example.org',
      sender: '@self:example.org',
      deviceId: 'SELF_DEVICE',
      expiresTs: BASE_TS + 60_000,
    },
    {
      userId: '@remote:example.org',
      sender: '@remote:example.org',
      deviceId: 'REMOTE_DEVICE',
      expiresTs: BASE_TS + 60_000,
    },
  ] as MatrixRtcMembershipFixture[],
  staleSelfAfterActiveCall: [
    {
      userId: '@self:example.org',
      sender: '@self:example.org',
      deviceId: 'SELF_DEVICE',
      expiresTs: BASE_TS - 10_000,
    },
  ] as MatrixRtcMembershipFixture[],
};
