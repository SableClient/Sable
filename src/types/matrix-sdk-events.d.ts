import type { PackContent, EmoteRoomsContent } from '$plugins/custom-emoji/types';
import type { IRecentEmojiContent } from '$plugins/recent-emoji';
import type { InCinnySpacesContent } from '$hooks/useSidebarItems';

declare module 'matrix-js-sdk/lib/@types/event' {
  type StateEvents = {
    'im.ponies.room_emotes': PackContent;
    'in.cinny.room.power_level_tags': Record<string, unknown>;
  };

  type AccountDataEvents = {
    'in.cinny.spaces': InCinnySpacesContent;
    'io.element.recent_emoji': IRecentEmojiContent;
    'im.ponies.user_emotes': PackContent;
    'im.ponies.emote_rooms': EmoteRoomsContent;
    'moe.sable.app.nicknames': Record<string, string>;
  };
}
