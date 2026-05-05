import type { PackContent, EmoteRoomsContent } from '$plugins/custom-emoji/types';
import type { IRecentEmojiContent } from '$plugins/recent-emoji';
import type { InCinnySpacesContent } from '$hooks/useSidebarItems';
import type { MemberPowerTag } from '$types/matrix/room';
import type { RoomAbbreviationsContent } from '$utils/abbreviations';
import type { PronounSet } from '$utils/pronouns';
import type * as prefix from '$unstable/prefixes';

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
    [prefix.MATRIX_UNSTABLE_STATE_ROOM_EMOTES_PROPERTY_NAME]: PackContent;
    [prefix.MATRIX_CINNY_UNSTABLE_STATE_ROOM_POWER_LEVELS_LABEL_PROPERTY_NAME]: PowerLevelTagsEventContent;
    [prefix.MATRIX_ELEMENT_UNSTABLE_STATE_ROOM_WIDGET_PROPERTY_NAME]: RoomWidgetEventContent;
    [prefix.MATRIX_SABLE_UNSTABLE_STATE_COSMETICS_MEMBER_COLOR_PROPERTY_NAME]: RoomCosmeticsColorEventContent;
    [prefix.MATRIX_SABLE_UNSTABLE_STATE_COSMETICS_MEMBER_FONT_PROPERTY_NAME]: RoomCosmeticsFontEventContent;
    [prefix.MATRIX_SABLE_UNSTABLE_STATE_COSMETICS_MEMBER_PRONOUNS_PROPERTY_NAME]: RoomCosmeticsPronounsEventContent;
    [prefix.MATRIX_SABLE_UNSTABLE_STATE_ROOM_ABBREVIATIONS_PROPERTY_NAME]: RoomAbbreviationsContent;
  }

  interface AccountDataEvents {
    [prefix.MATRIX_CINNY_UNSTABLE_ACCOUNT_SPACES_PROPERTY_NAME]: InCinnySpacesContent;
    [prefix.MATRIX_ELEMENT_UNSTABLE_ACCOUNT_RECENT_EMOJIS_PROPERTY_NAME]: IRecentEmojiContent;
    [prefix.MATRIX_UNSTABLE_ACCOUNT_USER_EMOTES_PROPERTY_NAME]: PackContent;
    [prefix.MATRIX_UNSTABLE_ACCOUNT_EMOTE_ROOMS_PROPERTY_NAME]: EmoteRoomsContent;
    [prefix.MATRIX_SABLE_UNSTABLE_ACCOUNT_NICKNAMES_PROPERTY_NAME]: Record<string, string>;
    [prefix.MATRIX_SABLE_UNSTABLE_ACCOUNT_SETTINGS_PROPERTY_NAME]: Record<string, unknown>;
  }
}
