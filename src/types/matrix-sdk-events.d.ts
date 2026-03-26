import type { PackContent, EmoteRoomsContent } from '$plugins/custom-emoji/types';
import type { IRecentEmojiContent } from '$plugins/recent-emoji';
import type { InCinnySpacesContent } from '$hooks/useSidebarItems';

declare module 'matrix-js-sdk/lib/@types/event' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- interface required for declaration merging in module augmentation
  interface StateEvents {
    'im.ponies.room_emotes': PackContent;
    'in.cinny.room.power_level_tags': Record<string, unknown>;
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- interface required for declaration merging in module augmentation
  interface AccountDataEvents {
    'in.cinny.spaces': InCinnySpacesContent;
    'io.element.recent_emoji': IRecentEmojiContent;
    'im.ponies.user_emotes': PackContent;
    'im.ponies.emote_rooms': EmoteRoomsContent;
    'moe.sable.app.nicknames': Record<string, string>;
    'moe.sable.app.settings': Record<string, unknown>;
  }
}
