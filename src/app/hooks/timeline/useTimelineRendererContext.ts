import { useMemo } from 'react';
import type { Room } from '$types/matrix-sdk';
import { EventType } from '$types/matrix-sdk';
import type { HTMLReactParserOptions } from 'html-react-parser';
import type { Opts as LinkifyOpts } from 'linkifyjs';
import {
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  makeMentionCustomProps,
  renderMatrixMention,
} from '$plugins/react-custom-html-parser';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useSettingsLinkBaseUrl } from '$features/settings/useSettingsLinkBaseUrl';
import { useMentionClickHandler } from '$hooks/useMentionClickHandler';
import { useSpoilerClickHandler } from '$hooks/useSpoilerClickHandler';
import { useRoomAbbreviationsContext } from '$hooks/useRoomAbbreviations';
import { buildAbbrReplaceTextNode } from '$components/message/RenderBody';
import { usePowerLevelsContext } from '$hooks/usePowerLevels';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { useGetMemberPowerTag } from '$hooks/useMemberPowerTag';
import { useMemberEventParser } from '$hooks/useMemberEventParser';
import type { ResolvedHiddenEventSettings } from '$state/hooks/settings';
import { useHiddenEventSettings, useSetting } from '$state/hooks/settings';
import { settingsAtom, type MessageLayout, type MessageSpacing } from '$state/settings';
import { nicknamesAtom } from '$state/nicknames';
import { useAtomValue } from 'jotai';

export interface TimelineRendererSettings {
  messageLayout: MessageLayout;
  messageSpacing: MessageSpacing;
  hideReads: boolean;
  showDeveloperTools: boolean;
  hour24Clock: boolean;
  dateFormatString: string;
  mediaAutoLoad: boolean;
  showBundledPreview: boolean;
  showUrlPreview: boolean;
  showClientUrlPreview: boolean;
  showMaps: boolean;
  autoplayStickers: boolean;
  hideMemberInReadOnly: boolean;
  isReadOnly: boolean;
  hideMembershipEvents: boolean;
  hideNickAvatarEvents: boolean;
  hiddenEvents: ResolvedHiddenEventSettings;
  // Not included by default — callers that need these add them on top:
  // hideThreadChip?: boolean;
}

export interface TimelineRendererPermissions {
  canRedact: boolean;
  canDeleteOwn: boolean;
  canSendReaction: boolean;
  canPinEvent: boolean;
  isReadOnly: boolean;
  getMemberPowerTag: ReturnType<typeof useGetMemberPowerTag>;
  parseMemberEvent: ReturnType<typeof useMemberEventParser>;
}

export interface TimelineRendererContextValue {
  settings: TimelineRendererSettings;
  linkifyOpts: LinkifyOpts;
  htmlReactParserOptions: HTMLReactParserOptions;
  permissions: TimelineRendererPermissions;
}

export function useTimelineRendererContext(room: Room): TimelineRendererContextValue {
  const mx = useMatrixClient();
  const nicknames = useAtomValue(nicknamesAtom);

  // Raw settings reads — same set in both RoomTimeline and ThreadDrawer
  const [messageLayout] = useSetting(settingsAtom, 'messageLayout');
  const [messageSpacing] = useSetting(settingsAtom, 'messageSpacing');
  const [hideReads] = useSetting(settingsAtom, 'hideReads');
  const [showDeveloperTools] = useSetting(settingsAtom, 'developerTools');
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');
  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [showBundledPreview] = useSetting(settingsAtom, 'bundledPreview');
  const [urlPreview] = useSetting(settingsAtom, 'urlPreview');
  const [encUrlPreview] = useSetting(settingsAtom, 'encUrlPreview');
  const [clientUrlPreview] = useSetting(settingsAtom, 'clientUrlPreview');
  const [encClientUrlPreview] = useSetting(settingsAtom, 'encClientUrlPreview');
  const [autoplayStickers] = useSetting(settingsAtom, 'autoplayStickers');
  const [autoplayEmojis] = useSetting(settingsAtom, 'autoplayEmojis');
  const [incomingInlineImagesDefaultHeight] = useSetting(
    settingsAtom,
    'incomingInlineImagesDefaultHeight'
  );
  const [incomingInlineImagesMaxHeight] = useSetting(settingsAtom, 'incomingInlineImagesMaxHeight');
  const [hideMemberInReadOnly] = useSetting(settingsAtom, 'hideMembershipInReadOnly');
  const [hideMembershipEvents] = useSetting(settingsAtom, 'hideMembershipEvents');
  const [hideNickAvatarEvents] = useSetting(settingsAtom, 'hideNickAvatarEvents');
  const [showInteractiveMap] = useSetting(settingsAtom, 'showInteractiveMap');
  const [showEncInteractiveMap] = useSetting(settingsAtom, 'showEncInteractiveMap');
  const hiddenEvents = useHiddenEventSettings(settingsAtom);

  // Derived settings
  const showMaps = room.hasEncryptionStateEvent() ? showEncInteractiveMap : showInteractiveMap;
  const showUrlPreview = room.hasEncryptionStateEvent() ? encUrlPreview : urlPreview;
  const showClientUrlPreview = room.hasEncryptionStateEvent()
    ? clientUrlPreview && encClientUrlPreview
    : clientUrlPreview;

  // Power levels & permissions
  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);
  const permissions = useRoomPermissions(creators, powerLevels);
  const canRedact = permissions.action('redact', mx.getSafeUserId());
  const canDeleteOwn = permissions.event(EventType.RoomRedaction, mx.getSafeUserId());
  const canSendReaction = permissions.event(EventType.Reaction, mx.getSafeUserId());
  const canPinEvent = permissions.stateEvent(EventType.RoomPinnedEvents, mx.getSafeUserId());
  const isReadOnly = !permissions.message(room.hasEncryptionStateEvent(), mx.getSafeUserId());
  const getMemberPowerTag = useGetMemberPowerTag(room, creators, powerLevels);
  const parseMemberEvent = useMemberEventParser();

  // linkifyOpts
  const mentionClickHandler = useMentionClickHandler(room.roomId);
  const settingsLinkBaseUrl = useSettingsLinkBaseUrl();

  const linkifyOpts = useMemo<LinkifyOpts>(
    () => ({
      ...LINKIFY_OPTS,
      render: factoryRenderLinkifyWithMention(
        settingsLinkBaseUrl,
        (href) =>
          renderMatrixMention(
            mx,
            room.roomId,
            href,
            makeMentionCustomProps(mentionClickHandler),
            nicknames
          ),
        mentionClickHandler
      ),
    }),
    [mx, room.roomId, mentionClickHandler, nicknames, settingsLinkBaseUrl]
  );

  // htmlReactParserOptions
  const useAuthentication = useMediaAuthentication();
  const spoilerClickHandler = useSpoilerClickHandler();
  const abbrMap = useRoomAbbreviationsContext();

  const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
    () =>
      getReactCustomHtmlParser(mx, room.roomId, {
        settingsLinkBaseUrl,
        linkifyOpts,
        useAuthentication,
        handleSpoilerClick: spoilerClickHandler,
        handleMentionClick: mentionClickHandler,
        nicknames,
        autoplayEmojis,
        incomingInlineImagesDefaultHeight,
        incomingInlineImagesMaxHeight,
        replaceTextNode: buildAbbrReplaceTextNode(abbrMap, linkifyOpts),
      }),
    [
      mx,
      room.roomId,
      linkifyOpts,
      autoplayEmojis,
      incomingInlineImagesDefaultHeight,
      incomingInlineImagesMaxHeight,
      mentionClickHandler,
      nicknames,
      useAuthentication,
      spoilerClickHandler,
      settingsLinkBaseUrl,
      abbrMap,
    ]
  );

  const settings = useMemo(
    () => ({
      messageLayout,
      messageSpacing,
      hideReads,
      showDeveloperTools,
      hour24Clock,
      dateFormatString,
      mediaAutoLoad,
      showBundledPreview,
      showUrlPreview,
      showClientUrlPreview,
      showMaps,
      autoplayStickers,
      hideMemberInReadOnly,
      isReadOnly,
      hideMembershipEvents,
      hideNickAvatarEvents,
      hiddenEvents,
    }),
    [
      messageLayout,
      messageSpacing,
      hideReads,
      showDeveloperTools,
      hour24Clock,
      dateFormatString,
      mediaAutoLoad,
      showBundledPreview,
      showUrlPreview,
      showClientUrlPreview,
      showMaps,
      autoplayStickers,
      hideMemberInReadOnly,
      isReadOnly,
      hideMembershipEvents,
      hideNickAvatarEvents,
      hiddenEvents,
    ]
  );

  return {
    settings,
    linkifyOpts,
    htmlReactParserOptions,
    permissions: {
      canRedact,
      canDeleteOwn,
      canSendReaction,
      canPinEvent,
      isReadOnly,
      getMemberPowerTag,
      parseMemberEvent,
    },
  };
}
