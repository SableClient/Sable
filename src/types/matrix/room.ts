import type { IImageInfo } from './common';

export type IMemberContent = {
  avatar_url?: string;
  displayname?: string;
  membership?: string;
  reason?: string;
  is_direct?: boolean;
};

export const CustomStateEvent = {
  PoniesRoomEmotes: 'im.ponies.room_emotes',
  PowerLevelTags: 'in.cinny.room.power_level_tags',
  RoomWidget: 'im.vector.modular.widgets',
  RoomCosmeticsColor: 'moe.sable.room.cosmetics.color',
  RoomCosmeticsFont: 'moe.sable.room.cosmetics.font',
  RoomCosmeticsPronouns: 'moe.sable.room.cosmetics.pronouns',
  RoomAbbreviations: 'moe.sable.room.abbreviations',
  RoomBanner: 'page.codeberg.everypizza.room.banner',
} as const;
export type CustomStateEvent = (typeof CustomStateEvent)[keyof typeof CustomStateEvent];

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

export type GetContentCallback = () => unknown;

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
