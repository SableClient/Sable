import { useMemo } from 'react';
import type { HTMLReactParserOptions } from 'html-react-parser';
import type { Opts as LinkifyOpts } from 'linkifyjs';
import { Box, Text } from 'folds';
import { useAtomValue } from 'jotai';
import type { MatrixEvent, Room } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useSettingsLinkBaseUrl } from '$features/settings/useSettingsLinkBaseUrl';
import {
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  renderMatrixMention,
} from '$plugins/react-custom-html-parser';
import { nicknamesAtom } from '$state/nicknames';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { RenderMessageContent } from '$components/RenderMessageContent';
import { buildMessagePreview, getPreviewEventContent } from '$utils/messagePreview';

type DisplayOnlyMessageContentProps = {
  room: Room;
  mEvent: MatrixEvent;
  fallbackText: string;
  mediaAutoLoad?: boolean;
  className?: string;
};

export function DisplayOnlyMessageContent({
  room,
  mEvent,
  fallbackText,
  mediaAutoLoad,
  className,
}: DisplayOnlyMessageContentProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const settingsLinkBaseUrl = useSettingsLinkBaseUrl();
  const nicknames = useAtomValue(nicknamesAtom);
  const [incomingInlineImagesDefaultHeight] = useSetting(
    settingsAtom,
    'incomingInlineImagesDefaultHeight'
  );
  const [incomingInlineImagesMaxHeight] = useSetting(settingsAtom, 'incomingInlineImagesMaxHeight');

  const linkifyOpts = useMemo<LinkifyOpts>(
    () => ({
      ...LINKIFY_OPTS,
      render: factoryRenderLinkifyWithMention(
        settingsLinkBaseUrl,
        (href) => renderMatrixMention(mx, room.roomId, href, { children: href }, nicknames, false),
        undefined,
        false
      ),
    }),
    [settingsLinkBaseUrl, mx, room.roomId, nicknames]
  );

  const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
    () =>
      getReactCustomHtmlParser(mx, room.roomId, {
        settingsLinkBaseUrl,
        linkifyOpts,
        useAuthentication,
        nicknames,
        incomingInlineImagesDefaultHeight,
        incomingInlineImagesMaxHeight,
        interactive: false,
      }),
    [
      mx,
      room.roomId,
      settingsLinkBaseUrl,
      linkifyOpts,
      useAuthentication,
      nicknames,
      incomingInlineImagesDefaultHeight,
      incomingInlineImagesMaxHeight,
    ]
  );

  const content = getPreviewEventContent(mEvent);
  const msgType = typeof content.msgtype === 'string' ? content.msgtype : '';
  const preview = buildMessagePreview(mEvent);

  if (!preview) {
    return (
      <Box className={className} style={{ pointerEvents: 'none' }}>
        <Text size="T300" priority="400">
          {fallbackText}
        </Text>
      </Box>
    );
  }

  if (!msgType) {
    return (
      <Box className={className} style={{ pointerEvents: 'none' }}>
        <Text size="T300" priority="400">
          {preview.placeholderText}
        </Text>
      </Box>
    );
  }

  return (
    <Box className={className} style={{ pointerEvents: 'none' }}>
      <RenderMessageContent
        displayName=""
        msgType={msgType}
        ts={mEvent.getTs()}
        edited={preview?.isEdited}
        getContent={() => content}
        mediaAutoLoad={mediaAutoLoad}
        urlPreview={false}
        clientUrlPreview={false}
        showMaps={false}
        htmlReactParserOptions={htmlReactParserOptions}
        linkifyOpts={linkifyOpts}
        outlineAttachment
        mx={mx}
        room={room}
        mEvent={mEvent}
      />
    </Box>
  );
}
