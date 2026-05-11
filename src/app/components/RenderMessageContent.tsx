import { memo, useMemo, useCallback } from 'react';
import type { IPreviewUrlResponse } from '$types/matrix-sdk';
import { MsgType } from '$types/matrix-sdk';
import { parseSettingsLink } from '$features/settings/settingsLink';
import { useSettingsLinkBaseUrl } from '$features/settings/useSettingsLinkBaseUrl';
import { testMatrixTo } from '$plugins/matrix-to';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom, CaptionPosition } from '$state/settings';
import type { HTMLReactParserOptions } from 'html-react-parser';
import type { Opts } from 'linkifyjs';
import { Box, config } from 'folds';
import {
  AudioContent,
  DownloadFile,
  FileContent,
  ImageContent,
  MAudio,
  MBadEncrypted,
  MEmote,
  MFile,
  MImage,
  MLocation,
  MNotice,
  MText,
  MVideo,
  ReadPdfFile,
  ReadTextFile,
  RenderBody,
  ThumbnailContent,
  UnsupportedContent,
  VideoContent,
} from './message';
import {
  UrlPreviewCard,
  UrlPreviewHolder,
  ClientPreview,
  ThemePreviewUrlCard,
  TweakPreviewUrlCard,
  youtubeUrl,
} from './url-preview';
import { isHttpsFullSableCssUrl } from '../theme/previewUrls';
import { Image, MediaControl, PersistedVolumeVideo } from './media';
import { ImageViewer } from './image-viewer';
import { PdfViewer } from './Pdf-viewer';
import { TextViewer } from './text-viewer';
import { ClientSideHoverFreeze } from './ClientSideHoverFreeze';
import { CuteEventType, MCuteEvent } from './message/MCuteEvent';

type RenderMessageContentProps = {
  displayName: string;
  msgType: string;
  ts: number;
  edited?: boolean;
  getContent: () => unknown;
  mediaAutoLoad?: boolean;
  bundledPreview?: boolean;
  urlPreview?: boolean;
  clientUrlPreview?: boolean;
  highlightRegex?: RegExp;
  htmlReactParserOptions: HTMLReactParserOptions;
  linkifyOpts: Opts;
  outlineAttachment?: boolean;
  hideCaption?: boolean;
};

const getMediaType = (url: string) => {
  const cleanUrl = url.toLowerCase();
  if (cleanUrl.match(/\.(mp4|webm|ogg)$/i)) return 'video';
  if (cleanUrl.match(/\.(png|jpg|jpeg|gif|webp)$/i) || cleanUrl.match(/@(jpeg|webp|png|jpg)$/i))
    return 'image';
  return null;
};

const isSableChatEmbedCandidate = (url: string): boolean =>
  /^https:\/\//i.test(url) &&
  (/\.preview\.sable\.css(\?|#|$)/i.test(url) || isHttpsFullSableCssUrl(url));

const CAPTION_STYLE = { marginTop: config.space.S200 };

function RenderMessageContentInternal({
  displayName,
  msgType,
  ts,
  edited,
  getContent,
  mediaAutoLoad,
  bundledPreview,
  urlPreview,
  clientUrlPreview,
  highlightRegex,
  htmlReactParserOptions,
  linkifyOpts,
  outlineAttachment,
  hideCaption,
}: RenderMessageContentProps) {
  const content = useMemo(() => getContent() as Record<string, unknown>, [getContent]);

  const [autoplayGifs] = useSetting(settingsAtom, 'autoplayGifs');
  const [captionPosition] = useSetting(settingsAtom, 'captionPosition');
  const [themeChatSableWidgets] = useSetting(settingsAtom, 'themeChatSableWidgetsEnabled');
  const [multiplePreviews] = useSetting(settingsAtom, 'multiplePreviews');
  const settingsLinkBaseUrl = useSettingsLinkBaseUrl();
  const captionPositionMap = {
    [CaptionPosition.Above]: 'column-reverse',
    [CaptionPosition.Below]: 'column',
    [CaptionPosition.Inline]: 'row',
    [CaptionPosition.Hidden]: 'row',
  } satisfies Record<CaptionPosition, React.CSSProperties['flexDirection']>;
  const attachmentDirection = captionPositionMap[captionPosition];

  const renderBody = useCallback(
    (props: Record<string, unknown>) => (
      <RenderBody
        {...props}
        body={props.body as string}
        highlightRegex={highlightRegex}
        htmlReactParserOptions={htmlReactParserOptions}
        linkifyOpts={linkifyOpts}
      />
    ),
    [highlightRegex, htmlReactParserOptions, linkifyOpts]
  );

  const renderUrlsPreview = useCallback(
    (urls: string[]) => {
      const filteredUrls = urls.filter(
        (url) => !testMatrixTo(url) && !parseSettingsLink(settingsLinkBaseUrl, url)
      );
      if (filteredUrls.length === 0) return undefined;

      const themePreviewUrls = themeChatSableWidgets
        ? filteredUrls.filter(
            (u) => /^https:\/\//i.test(u) && /\.preview\.sable\.css(\?|#|$)/i.test(u)
          )
        : [];
      const themeToRender = themePreviewUrls.filter((u) => /^https:\/\//i.test(u));

      const tweakCandidateUrls = themeChatSableWidgets
        ? filteredUrls.filter((u) => isHttpsFullSableCssUrl(u))
        : [];

      const analyzed = filteredUrls.map((url) => ({
        url,
        type: getMediaType(url),
      }));
      const mediaLinks = analyzed.filter((item) => item.type !== null);
      const previewCandidates = mediaLinks.length > 0 ? mediaLinks : analyzed;
      const toRender = multiplePreviews ? previewCandidates : [previewCandidates[0]!];
      return (
        <UrlPreviewHolder>
          {themeToRender.map((url) => (
            <ThemePreviewUrlCard key={`theme:${url}`} url={url} />
          ))}
          {tweakCandidateUrls.map((url) => (
            <TweakPreviewUrlCard key={`tweak:${url}`} url={url} />
          ))}
          {toRender.map((item) => {
            const { url, type } = item;
            if (themeToRender.includes(url)) return null;
            if (tweakCandidateUrls.includes(url)) return null;
            if (type) {
              return <UrlPreviewCard urlPreview key={url} url={url} ts={ts} mediaType={type} />;
            }
            if (!themeChatSableWidgets && isSableChatEmbedCandidate(url)) return null;
            if (clientUrlPreview && youtubeUrl(url)) {
              return <ClientPreview key={url} url={url} />;
            }
            if (urlPreview) {
              return <UrlPreviewCard urlPreview key={url} url={url} ts={ts} mediaType={type} />;
            }
            return null;
          })}
        </UrlPreviewHolder>
      );
    },
    [multiplePreviews, themeChatSableWidgets, settingsLinkBaseUrl, clientUrlPreview, urlPreview, ts]
  );
  const renderBundledPreviews = useCallback(
    (bundles: IPreviewUrlResponse[]) => (
      <UrlPreviewHolder>
        {bundles.map((bundle) => (
          <UrlPreviewCard
            urlPreview={urlPreview === true}
            key={bundle['og:url']}
            url={bundle['og:url']}
            bundle={bundle}
          />
        ))}
      </UrlPreviewHolder>
    ),
    [urlPreview]
  );
  const messageUrlsPreview = urlPreview || themeChatSableWidgets ? renderUrlsPreview : undefined;
  const messageBundlePreview = bundledPreview ? renderBundledPreviews : undefined;

  const renderCaption = () => {
    const hasCaption = content.body && (content.body as string).trim().length > 0;
    if (captionPosition === CaptionPosition.Hidden || hideCaption) return null;
    if (
      hasCaption &&
      (content as { filename?: string }).filename &&
      (content as { filename?: string }).filename !== content.body
    ) {
      if (captionPosition !== CaptionPosition.Inline)
        return (
          <MText
            style={CAPTION_STYLE}
            edited={edited}
            content={content}
            renderBody={renderBody}
            renderUrlsPreview={messageUrlsPreview}
            renderBundledPreviews={messageBundlePreview}
          />
        );
      return (
        <Box
          style={{
            padding: config.space.S200,
            wordBreak: 'break-word',
            maxWidth: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flexShrink: 1,
          }}
        >
          <MText
            edited={edited}
            content={content}
            renderBody={renderBody}
            renderUrlsPreview={messageUrlsPreview}
            renderBundledPreviews={messageBundlePreview}
          />
        </Box>
      );
    }
    return null;
  };

  function renderCaptionedAttachment(attachment: JSX.Element): JSX.Element {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: attachmentDirection,
        }}
      >
        <div>{attachment}</div>
        {renderCaption()}
      </div>
    );
  }

  const renderFile = () =>
    renderCaptionedAttachment(
      <MFile
        content={content as Record<string, never> & { msgtype: MsgType.File }}
        renderFileContent={({ body, mimeType, info, encInfo, url }) => (
          <FileContent
            body={body}
            mimeType={mimeType}
            renderAsPdfFile={() => (
              <ReadPdfFile
                body={body}
                mimeType={mimeType}
                url={url}
                encInfo={encInfo}
                renderViewer={(p) => <PdfViewer {...p} />}
              />
            )}
            renderAsTextFile={() => (
              <ReadTextFile
                body={body}
                mimeType={mimeType}
                url={url}
                encInfo={encInfo}
                renderViewer={(p) => <TextViewer {...p} />}
              />
            )}
          >
            <DownloadFile body={body} mimeType={mimeType} url={url} encInfo={encInfo} info={info} />
          </FileContent>
        )}
        outlined={outlineAttachment}
      />
    );

  if (msgType === (MsgType.Text as string)) {
    return (
      <MText
        edited={edited}
        content={content}
        renderBody={renderBody}
        renderUrlsPreview={messageUrlsPreview}
        renderBundledPreviews={messageBundlePreview}
      />
    );
  }

  if (msgType === (MsgType.Emote as string)) {
    if ((content as { 'fyi.cisnt.headpat'?: boolean })['fyi.cisnt.headpat']) {
      return (
        <MCuteEvent
          content={(content as { body?: string }).body}
          type={CuteEventType.Headpat}
          mentionedUserIds={
            (content as { 'm.mentions'?: { user_ids?: string[] } })['m.mentions']?.user_ids
          }
        />
      );
    }
    return (
      <MEmote
        displayName={displayName}
        edited={edited}
        content={content}
        renderBody={renderBody}
        renderUrlsPreview={messageUrlsPreview}
        renderBundledPreviews={messageBundlePreview}
      />
    );
  }

  if (msgType === (MsgType.Notice as string)) {
    return (
      <MNotice
        edited={edited}
        content={content}
        renderBody={renderBody}
        renderUrlsPreview={messageUrlsPreview}
        renderBundledPreviews={messageBundlePreview}
      />
    );
  }

  if (msgType === (MsgType.Image as string)) {
    const info = (content as { info?: { mimetype?: string } }).info;
    const isGif =
      info?.mimetype === 'image/gif' ||
      info?.mimetype === 'image/apng' ||
      info?.mimetype === 'image/webp' ||
      (content.body as string)?.toLowerCase().endsWith('.gif') ||
      (content.body as string)?.toLowerCase().endsWith('.apng') ||
      (content.body as string)?.toLowerCase().endsWith('.webp') ||
      (typeof (content as { url?: string }).url === 'string' &&
        ((content as { url?: string }).url?.toLowerCase().endsWith('.gif') ||
          (content as { url?: string }).url?.toLowerCase().endsWith('.apng') ||
          (content as { url?: string }).url?.toLowerCase().endsWith('.webp')));

    return renderCaptionedAttachment(
      <MImage
        content={content as Record<string, never> & { msgtype: MsgType.Image }}
        renderImageContent={(imageProps) => (
          <ImageContent
            {...imageProps}
            autoPlay={mediaAutoLoad}
            renderImage={(p) => {
              if (isGif && !autoplayGifs && p.src) {
                return (
                  <ClientSideHoverFreeze src={p.src}>
                    <Image {...p} loading="lazy" />
                  </ClientSideHoverFreeze>
                );
              }
              return <Image {...p} loading="lazy" />;
            }}
            renderViewer={(p) => <ImageViewer {...p} />}
          />
        )}
        outlined={outlineAttachment}
      />
    );
  }

  if (msgType === (MsgType.Video as string)) {
    return renderCaptionedAttachment(
      <MVideo
        content={content as Record<string, never> & { msgtype: MsgType.Video }}
        renderAsFile={renderFile}
        renderVideoContent={({ body, info, ...videoProps }) => (
          <VideoContent
            body={body}
            info={info}
            {...videoProps}
            renderThumbnail={
              mediaAutoLoad
                ? () => (
                    <ThumbnailContent
                      info={info}
                      renderImage={(src) => (
                        <Image alt={body} title={body} src={src} loading="lazy" />
                      )}
                    />
                  )
                : undefined
            }
            renderVideo={(p) => <PersistedVolumeVideo {...p} />}
          />
        )}
        outlined={outlineAttachment}
      />
    );
  }

  if (msgType === (MsgType.Audio as string)) {
    return renderCaptionedAttachment(
      <MAudio
        content={content as Record<string, never> & { msgtype: MsgType.Audio }}
        renderAsFile={renderFile}
        renderAudioContent={(audioProps) => (
          <AudioContent {...audioProps} renderMediaControl={(p) => <MediaControl {...p} />} />
        )}
        outlined={outlineAttachment}
      />
    );
  }

  if (msgType === (MsgType.File as string)) return renderFile();
  if (msgType === (MsgType.Location as string)) return <MLocation content={content} />;
  if (msgType === 'm.bad.encrypted') return <MBadEncrypted />;

  // cute events
  if (msgType === 'im.fluffychat.cute_event')
    return (
      <MCuteEvent
        content={(content as { body?: string }).body}
        type={(content as { cute_type: CuteEventType }).cute_type ?? CuteEventType.Hug}
        mentionedUserIds={
          (content as { 'm.mentions'?: { user_ids?: string[] } })['m.mentions']?.user_ids
        }
      />
    );
  // as fallback to render older events where msgtype was set instead of m.emote with a custom property
  if (msgType === 'fyi.cisnt.headpat')
    return (
      <MCuteEvent
        content={(content as { body?: string }).body}
        type={CuteEventType.Headpat}
        mentionedUserIds={
          (content as { 'm.mentions'?: { user_ids?: string[] } })['m.mentions']?.user_ids
        }
      />
    );
  return <UnsupportedContent body={(content as { body?: string }).body ?? ''} />;
}

export const RenderMessageContent = memo(RenderMessageContentInternal);
