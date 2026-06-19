import { useMemo } from 'react';
import type { HTMLReactParserOptions } from 'html-react-parser';
import type { Opts as LinkifyOpts } from 'linkifyjs';
import { Text } from 'folds';
import { useAtomValue } from 'jotai';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { RenderBody } from '$components/message/RenderBody';
import {
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  renderMatrixMention,
} from '$plugins/react-custom-html-parser';
import { useSettingsLinkBaseUrl } from '$features/settings/useSettingsLinkBaseUrl';
import { nicknamesAtom } from '$state/nicknames';
import type { MessagePreviewModel } from '$utils/messagePreview';
import { canRenderInlineMessagePreview as canRenderInlinePreview } from '$utils/messagePreview';

type CompactMessagePreviewProps = {
  senderLabel: string;
  preview: MessagePreviewModel;
  roomId: string;
  className?: string;
};

export function CompactMessagePreview({
  senderLabel,
  preview,
  roomId,
  className,
}: CompactMessagePreviewProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const settingsLinkBaseUrl = useSettingsLinkBaseUrl();
  const nicknames = useAtomValue(nicknamesAtom);

  const linkifyOpts = useMemo<LinkifyOpts>(
    () => ({
      ...LINKIFY_OPTS,
      render: factoryRenderLinkifyWithMention(
        settingsLinkBaseUrl,
        (href) => renderMatrixMention(mx, roomId, href, { children: href }, nicknames, false),
        undefined,
        false
      ),
    }),
    [settingsLinkBaseUrl, mx, roomId, nicknames]
  );

  const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
    () =>
      getReactCustomHtmlParser(mx, roomId, {
        settingsLinkBaseUrl,
        linkifyOpts,
        useAuthentication,
        nicknames,
        interactive: false,
        previewMode: true,
      }),
    [mx, roomId, settingsLinkBaseUrl, linkifyOpts, useAuthentication, nicknames]
  );

  const canRenderRichBody = canRenderInlinePreview(preview);

  if (!canRenderRichBody) {
    return (
      <Text className={className} truncate size="T200" priority="300">
        <b>{senderLabel}:</b> {preview.placeholderText}
      </Text>
    );
  }

  return (
    <Text className={className} truncate size="T200" priority="300">
      <b>{senderLabel}:</b>{' '}
      <RenderBody
        body={preview.body ?? preview.text}
        customBody={preview.formattedBody}
        htmlReactParserOptions={htmlReactParserOptions}
        linkifyOpts={linkifyOpts}
      />
    </Text>
  );
}
