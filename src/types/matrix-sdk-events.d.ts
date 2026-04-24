import type { PackContent, EmoteRoomsContent } from '$plugins/custom-emoji/types';
import type { IRecentEmojiContent } from '$plugins/recent-emoji';
import type { InCinnySpacesContent } from '$hooks/useSidebarItems';
import type { MemberPowerTag } from '$types/matrix/room';
import type { RoomAbbreviationsContent } from '$utils/abbreviations';
import type { PronounSet } from '$utils/pronouns';

type PowerLevelTagsEventContent = Record<number, MemberPowerTag>;

type RoomWidgetEventContent =
  | {
      type: 'm.custom';
      url: string;
      name: string;
      id: string;
      creatorUserId: string | null;
      data?: Record<string, unknown>;
      waitForIframeLoad?: boolean;
    }
  | Record<string, never>;

type RoomCosmeticsColorEventContent = {
  color?: string;
};

type RoomCosmeticsFontEventContent = {
  font?: string;
};

type RoomCosmeticsPronounsEventContent = {
  pronouns?: PronounSet[];
};

declare module 'matrix-js-sdk/lib/@types/event' {
  interface StateEvents {
    'im.ponies.room_emotes': PackContent;
    'in.cinny.room.power_level_tags': PowerLevelTagsEventContent;
    'im.vector.modular.widgets': RoomWidgetEventContent;
    'moe.sable.room.cosmetics.color': RoomCosmeticsColorEventContent;
    'moe.sable.room.cosmetics.font': RoomCosmeticsFontEventContent;
    'moe.sable.room.cosmetics.pronouns': RoomCosmeticsPronounsEventContent;
    'moe.sable.room.abbreviations': RoomAbbreviationsContent;
  }

  interface AccountDataEvents {
    'in.cinny.spaces': InCinnySpacesContent;
    'io.element.recent_emoji': IRecentEmojiContent;
    'im.ponies.user_emotes': PackContent;
    'im.ponies.emote_rooms': EmoteRoomsContent;
    'moe.sable.app.nicknames': Record<string, string>;
    'moe.sable.app.settings': Record<string, unknown>;
  }
}
