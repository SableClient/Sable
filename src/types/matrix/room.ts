import { IImageInfo } from './common';

export enum Membership {
  Invite = 'invite',
  Knock = 'knock',
  Join = 'join',
  Leave = 'leave',
  Ban = 'ban',
}

export type IMemberContent = {
  avatar_url?: string;
  displayname?: string;
  membership?: Membership;
  reason?: string;
  is_direct?: boolean;
};

export enum StateEvent {
  // Cinny/Matrix state events
  RoomCanonicalAlias = 'm.room.canonical_alias',
  RoomCreate = 'm.room.create',
  RoomJoinRules = 'm.room.join_rules',
  RoomMember = 'm.room.member',
  RoomThirdPartyInvite = 'm.room.third_party_invite',
  RoomPowerLevels = 'm.room.power_levels',
  RoomName = 'm.room.name',
  RoomTopic = 'm.room.topic',
  RoomAvatar = 'm.room.avatar',
  RoomPinnedEvents = 'm.room.pinned_events',
  RoomEncryption = 'm.room.encryption',
  RoomHistoryVisibility = 'm.room.history_visibility',
  RoomGuestAccess = 'm.room.guest_access',
  RoomServerAcl = 'm.room.server_acl',
  RoomTombstone = 'm.room.tombstone',
  GroupCallPrefix = 'org.matrix.msc3401.call',
  GroupCallMemberPrefix = 'org.matrix.msc3401.call.member',

  SpaceChild = 'm.space.child',
  SpaceParent = 'm.space.parent',

  PoniesRoomEmotes = 'im.ponies.room_emotes',
  PowerLevelTags = 'in.cinny.room.power_level_tags',

  // Widget state events
  RoomWidget = 'im.vector.modular.widgets',

  // Sable state events
  RoomCosmeticsColor = 'moe.sable.room.cosmetics.color',
  RoomCosmeticsFont = 'moe.sable.room.cosmetics.font',
  RoomCosmeticsPronouns = 'moe.sable.room.cosmetics.pronouns',
  RoomAbbreviations = 'moe.sable.room.abbreviations',
}

export enum MessageEvent {
  RoomMessage = 'm.room.message',
  RoomMessageEncrypted = 'm.room.encrypted',
  Sticker = 'm.sticker',
  RoomRedaction = 'm.room.redaction',
  Reaction = 'm.reaction',
  // MSC3381 Polls — unstable prefix (still the most common in the wild)
  PollStart = 'org.matrix.msc3381.poll.start',
  PollResponse = 'org.matrix.msc3381.poll.response',
  PollEnd = 'org.matrix.msc3381.poll.end',
  // MSC3381 Polls — stable types (used by newer servers)
  StablePollStart = 'm.poll.start',
  StablePollResponse = 'm.poll.response',
  StablePollEnd = 'm.poll.end',
}

export enum RoomType {
  Space = 'm.space',
  Call = 'org.matrix.msc3417.call',
}

export type MSpaceChildContent = {
  via: string[];
  suggested?: boolean;
  order?: string;
};

export enum NotificationType {
  Default = 'default',
  AllMessages = 'all_messages',
  MentionsAndKeywords = 'mentions_and_keywords',
  Mute = 'mute',
}

export type IRoomCreateContent = {
  creator?: string;
  ['m.federate']?: boolean;
  room_version: string;
  type?: string;
  additional_creators?: string[];
  predecessor?: {
    event_id?: string;
    room_id: string;
  };
};

export type GetContentCallback = <T>() => T;

export type RoomToParents = Map<string, Set<string>>;
export type Unread = {
  total: number;
  highlight: number;
  from: Set<string> | null;
};
export type RoomToUnread = Map<string, Unread>;
export type UnreadInfo = {
  roomId: string;
  total: number;
  highlight: number;
};

export type MuteChanges = {
  added: string[];
  removed: string[];
};

export type MemberPowerTagIcon = {
  key?: string;
  info?: IImageInfo;
};
export type MemberPowerTag = {
  name: string;
  color?: string;
  icon?: MemberPowerTagIcon;
};
