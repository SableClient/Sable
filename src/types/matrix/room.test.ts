import { describe, expect, it } from 'vitest';
import { EventType, KnownMembership, RoomType, type StateEvents } from '$types/matrix-sdk';

const LEGACY_STANDARD_STATE_EVENT_KEYS = {
  RoomCanonicalAlias: EventType.RoomCanonicalAlias,
  RoomCreate: EventType.RoomCreate,
  RoomJoinRules: EventType.RoomJoinRules,
  RoomMember: EventType.RoomMember,
  RoomThirdPartyInvite: EventType.RoomThirdPartyInvite,
  RoomPowerLevels: EventType.RoomPowerLevels,
  RoomName: EventType.RoomName,
  RoomTopic: EventType.RoomTopic,
  RoomAvatar: EventType.RoomAvatar,
  RoomPinnedEvents: EventType.RoomPinnedEvents,
  RoomEncryption: EventType.RoomEncryption,
  RoomHistoryVisibility: EventType.RoomHistoryVisibility,
  RoomGuestAccess: EventType.RoomGuestAccess,
  RoomServerAcl: EventType.RoomServerAcl,
  RoomTombstone: EventType.RoomTombstone,
  GroupCallPrefix: EventType.GroupCallPrefix,
  GroupCallMemberPrefix: EventType.GroupCallMemberPrefix,
  SpaceChild: EventType.SpaceChild,
  SpaceParent: EventType.SpaceParent,
} as const satisfies Record<string, keyof StateEvents>;

const LEGACY_STANDARD_MESSAGE_EVENT_KEYS = {
  RoomMessage: EventType.RoomMessage,
  RoomMessageEncrypted: EventType.RoomMessageEncrypted,
  Sticker: EventType.Sticker,
  RoomRedaction: EventType.RoomRedaction,
  Reaction: EventType.Reaction,
} as const;

const LEGACY_STANDARD_MEMBERSHIP_KEYS = {
  Invite: KnownMembership.Invite,
  Knock: KnownMembership.Knock,
  Join: KnownMembership.Join,
  Leave: KnownMembership.Leave,
  Ban: KnownMembership.Ban,
} as const;

const LEGACY_STANDARD_ROOM_TYPE_KEYS = {
  Space: RoomType.Space,
  Call: RoomType.UnstableCall,
} as const;

describe('Matrix SDK room event keys', () => {
  it('keeps the old standard state-event keys available from the SDK', () => {
    expect(LEGACY_STANDARD_STATE_EVENT_KEYS).toStrictEqual({
      RoomCanonicalAlias: 'm.room.canonical_alias',
      RoomCreate: 'm.room.create',
      RoomJoinRules: 'm.room.join_rules',
      RoomMember: 'm.room.member',
      RoomThirdPartyInvite: 'm.room.third_party_invite',
      RoomPowerLevels: 'm.room.power_levels',
      RoomName: 'm.room.name',
      RoomTopic: 'm.room.topic',
      RoomAvatar: 'm.room.avatar',
      RoomPinnedEvents: 'm.room.pinned_events',
      RoomEncryption: 'm.room.encryption',
      RoomHistoryVisibility: 'm.room.history_visibility',
      RoomGuestAccess: 'm.room.guest_access',
      RoomServerAcl: 'm.room.server_acl',
      RoomTombstone: 'm.room.tombstone',
      GroupCallPrefix: 'org.matrix.msc3401.call',
      GroupCallMemberPrefix: 'org.matrix.msc3401.call.member',
      SpaceChild: 'm.space.child',
      SpaceParent: 'm.space.parent',
    });
  });

  it('keeps the old standard message-event keys available from the SDK', () => {
    expect(LEGACY_STANDARD_MESSAGE_EVENT_KEYS).toStrictEqual({
      RoomMessage: 'm.room.message',
      RoomMessageEncrypted: 'm.room.encrypted',
      Sticker: 'm.sticker',
      RoomRedaction: 'm.room.redaction',
      Reaction: 'm.reaction',
    });
  });

  it('keeps the old standard membership keys available from the SDK', () => {
    expect(LEGACY_STANDARD_MEMBERSHIP_KEYS).toStrictEqual({
      Invite: 'invite',
      Knock: 'knock',
      Join: 'join',
      Leave: 'leave',
      Ban: 'ban',
    });
  });

  it('keeps the old standard room-type keys available from the SDK', () => {
    expect(LEGACY_STANDARD_ROOM_TYPE_KEYS).toStrictEqual({
      Space: 'm.space',
      Call: 'org.matrix.msc3417.call',
    });
  });
});
