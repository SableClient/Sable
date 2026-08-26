import type { CSSProperties, JSX } from 'react';
import { memo, useMemo, useCallback } from 'react';
import type { IPreviewUrlResponse, MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import { MsgType } from '$types/matrix-sdk';
import { parseSettingsLink } from '$features/settings/settingsLink';
import { useSettingsLinkBaseUrl } from '$features/settings/useSettingsLinkBaseUrl';
import { testMatrixTo } from '$plugins/matrix-to';
import { testMatrixUri } from '$plugins/matrix-uri';
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
  MGallery,
  ReadPdfFile,
  ReadTextFile,
  RenderBody,
  ThumbnailContent,
  UnsupportedContent,
  UploadedSableCssContent,
  VideoContent,
} from './message';
import { LongMessageCollapse } from './message/LongMessageCollapse';
import {
  UrlPreviewCard,
  UrlPreviewHolder,
  ClientPreview,
  ThemePreviewUrlCard,
  TweakPreviewUrlCard,
  youtubeUrl,
} from './url-preview';
import { isHttpsFullSableCssUrl } from '../theme/previewUrls';
import { isSableCssAttachmentFileName } from '../theme/processThemeImport';
import { Image, MediaControl, PersistedVolumeVideo } from './media';
import { ImageViewer } from './image-viewer';
import { PdfViewer } from './Pdf-viewer';
import { TextViewer } from './text-viewer';
import { ClientSideHoverFreeze } from './ClientSideHoverFreeze';
import { CuteEventType, MCuteEvent } from './message/MCuteEvent';
import { PollEvent } from './message/PollEvent';
import { M_POLL_START, M_TEXT } from 'matrix-js-sdk';
import type { IImageInfo, IGalleryContent } from '$types/matrix/common';
import { GALLERY_MSGTYPE } from '$types/matrix/common';
import { parseExternalGif } from '$utils/externalGif';
import { parseLegacyKlipyGif } from '$utils/klipy';
import {
  MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME,
  MATRIX_UNSTABLE_SPOILER_PROPERTY_NAME,
} from '$unstable/prefixes';
import {
  convertBeeperFormatToOurPerMessageProfile,
  type PerMessageProfileBeeperFormat,
  stripPerMessageProfileFormattedBody,
  stripPerMessageProfilePlainBody,
} from '$hooks/usePerMessageProfile';

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
  isGallery?: boolean;
  showMaps?: boolean;
  highlightRegex?: RegExp;
  htmlReactParserOptions: HTMLReactParserOptions;
  linkifyOpts: Opts;
  outlineAttachment?: boolean;
  hideCaption?: boolean;
  mEvent?: MatrixEvent;
  mx?: MatrixClient;
  room?: Room;
  onOpenMedia?: (mEvent: MatrixEvent) => boolean;
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

const CAPTION_STYLE: CSSProperties = { marginTop: config.space.S200, maxWidth: '100%' };
const TEXT_STYLE: CSSProperties = { maxWidth: '100%' };
const EXTERNAL_GIF_MAX_SIZE = 400;

function RenderMessageContentInternal({
  displayName,
  msgType,
  ts,
  edited,
  getContent,
  mediaAutoLoad,
  isGallery,
  bundledPreview,
  urlPreview,
  clientUrlPreview,
  showMaps,
  highlightRegex,
  htmlReactParserOptions,
  linkifyOpts,
  outlineAttachment,
  hideCaption,
  mEvent,
  mx,
  room,
  onOpenMedia,
}: RenderMessageContentProps) {
  const content = useMemo(() => getContent() as Record<string, unknown>, [getContent]);

  const [autoplayGifs] = useSetting(settingsAtom, 'autoplayGifs');
  const [captionPosition] = useSetting(settingsAtom, 'captionPosition');
  const [themeChatSableWidgets] = useSetting(settingsAtom, 'themeChatSableWidgetsEnabled');
  const [multiplePreviews] = useSetting(settingsAtom, 'multiplePreviews');
  const [externalGifAutoLoadEncrypted] = useSetting(settingsAtom, 'externalGifAutoLoadEncrypted');
  const externalGif = useMemo(
    () =>
      msgType === (MsgType.Text as string)
        ? parseExternalGif(content)
        : msgType === (MsgType.Image as string)
          ? parseLegacyKlipyGif(content)
          : undefined,
    [content, msgType]
  );
  const roomEncryptionKnown =
    room !== undefined && typeof room.hasEncryptionStateEvent === 'function';
  const isEncryptedRoom = roomEncryptionKnown ? room.hasEncryptionStateEvent() : false;
  const externalGifAutoLoad =
    roomEncryptionKnown &&
    (!isEncryptedRoom || externalGifAutoLoadEncrypted) &&
    (mediaAutoLoad ?? true);
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
      <LongMessageCollapse>
        <RenderBody
          {...props}
          body={props.body as string}
          highlightRegex={highlightRegex}
          htmlReactParserOptions={htmlReactParserOptions}
          linkifyOpts={linkifyOpts}
        />
      </LongMessageCollapse>
    ),
    [highlightRegex, htmlReactParserOptions, linkifyOpts]
  );

  const renderUrlsPreview = useCallback(
    (urls: string[]) => {
      const filteredUrls = urls.filter(
        (url) =>
          !testMatrixTo(url) && !testMatrixUri(url) && !parseSettingsLink(settingsLinkBaseUrl, url)
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
            const { url } = item;
            if (themeToRender.includes(url)) return null;
            if (tweakCandidateUrls.includes(url)) return null;

            if (!themeChatSableWidgets && isSableChatEmbedCandidate(url)) return null;
            if (clientUrlPreview && youtubeUrl(url)) {
              return <ClientPreview key={url} url={url} />;
            }
            if (urlPreview) {
              return <UrlPreviewCard urlPreview key={url} url={url} ts={ts} />;
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
  const hasExternalGifMetadata = !!externalGif;
  const messageUrlsPreview =
    !hasExternalGifMetadata && (urlPreview || themeChatSableWidgets)
      ? renderUrlsPreview
      : undefined;
  const messageBundlePreview =
    !hasExternalGifMetadata && bundledPreview ? renderBundledPreviews : undefined;

  const renderCaption = () => {
    const hasCaption = content.body && (content.body as string).trim().length > 0;
    if (captionPosition === CaptionPosition.Hidden || hideCaption) return null;
    if (
      hasCaption &&
      (((content as { filename?: string }).filename &&
        (content as { filename?: string }).filename !== content.body) ||
        msgType === GALLERY_MSGTYPE)
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
            paddingRight: config.space.S0,
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
            style={TEXT_STYLE}
          />
        </Box>
      );
    }
    return null;
  };

  if (externalGif) {
    const markedAsSpoiler = content[MATRIX_UNSTABLE_SPOILER_PROPERTY_NAME] === true;
    const externalGifWidth =
      externalGif.h >= externalGif.w
        ? `${(EXTERNAL_GIF_MAX_SIZE * externalGif.w) / externalGif.h}px`
        : undefined;
    return (
      <Box direction="Column" style={{ maxWidth: '100%' }}>
        {msgType === (MsgType.Text as string) && typeof content.body === 'string' && (
          <Box
            style={{
              marginBottom: config.space.S200,
              maxWidth: '100%',
              wordBreak: 'break-word',
            }}
          >
            <MText edited={edited} content={content} renderBody={renderBody} style={TEXT_STYLE} />
          </Box>
        )}
        <ImageContent
          url={externalGif.media_url}
          body={externalGif.title}
          info={{
            w: externalGif.w,
            h: externalGif.h,
            mimetype: externalGif.mimetype,
            size: externalGif.size,
            [MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME]: externalGif.blurhash,
          }}
          autoPlay={externalGifAutoLoad && !markedAsSpoiler}
          markedAsSpoiler={markedAsSpoiler}
          favoriteShareUrl={
            msgType === (MsgType.Text as string) && typeof content.body === 'string'
              ? content.body
              : externalGif.media_url
          }
          loadLabel="Load GIF"
          loadDescription={`External GIF from ${externalGif.provider.toUpperCase()}`}
          deferMediaLoad
          style={{
            borderRadius: config.radii.R300,
            overflow: 'hidden',
            width: externalGifWidth,
            maxWidth: `min(100%, ${EXTERNAL_GIF_MAX_SIZE}px)`,
            maxHeight: `${EXTERNAL_GIF_MAX_SIZE}px`,
          }}
          onOpenViewer={mEvent ? () => onOpenMedia?.(mEvent) ?? false : undefined}
          renderImage={(p) => {
            if (!autoplayGifs && p.src) {
              return (
                <ClientSideHoverFreeze src={p.src}>
                  <Image info={p.info} {...p} loading="lazy" />
                </ClientSideHoverFreeze>
              );
            }
            return <Image info={p.info} {...p} loading="lazy" />;
          }}
          renderViewer={(p) => <ImageViewer {...p} />}
        />
      </Box>
    );
  }

  function renderCaptionedAttachment(attachment: JSX.Element, isInGallery?: boolean): JSX.Element {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: attachmentDirection,
          height: '100%',
          width: '100%',
          position: 'relative',
        }}
      >
        {attachment}
        {!isInGallery && renderCaption()}
      </div>
    );
  }

  const renderFile = () =>
    renderCaptionedAttachment(
      <MFile
        content={content as Record<string, never> & { msgtype: MsgType.File }}
        renderFileContent={({ fileName, mimeType, info, encInfo, url }) => (
          <FileContent
            body={fileName}
            mimeType={mimeType}
            renderAsPdfFile={() => (
              <ReadPdfFile
                body={fileName}
                mimeType={mimeType}
                url={url}
                encInfo={encInfo}
                renderViewer={(p) => <PdfViewer {...p} />}
              />
            )}
            renderAsTextFile={() => (
              <ReadTextFile
                body={fileName}
                mimeType={mimeType}
                url={url}
                encInfo={encInfo}
                renderViewer={(p) => <TextViewer {...p} />}
              />
            )}
          >
            {themeChatSableWidgets && isSableCssAttachmentFileName(fileName) && (
              <UploadedSableCssContent
                body={fileName}
                mimeType={mimeType}
                url={url}
                encInfo={encInfo}
                size={info.size}
              />
            )}
            <DownloadFile
              body={fileName}
              mimeType={mimeType}
              url={url}
              encInfo={encInfo}
              info={info}
            />
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
        style={TEXT_STYLE}
      />
    );
  }

  if (msgType === (MsgType.Emote as string)) {
    const beeperProfile = content['com.beeper.per_message_profile'] as
      | PerMessageProfileBeeperFormat
      | undefined;
    const pmp = beeperProfile
      ? convertBeeperFormatToOurPerMessageProfile(beeperProfile)
      : undefined;

    const strippedContent = pmp
      ? {
          ...content,
          formatted_body: stripPerMessageProfileFormattedBody(content['formatted_body'] as string),
          body: stripPerMessageProfilePlainBody(content['body'] as string),
        }
      : content;

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
        displayName={pmp?.displayname ?? displayName}
        edited={edited}
        content={strippedContent}
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
    const { info } = content as { info?: IImageInfo };
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
        fitParent={isGallery}
        renderImageContent={(imageProps) => (
          <ImageContent
            {...imageProps}
            onOpenViewer={mEvent ? () => onOpenMedia?.(mEvent) ?? false : undefined}
            autoPlay={mediaAutoLoad}
            renderImage={(p) => {
              if (isGif && !autoplayGifs && p.src) {
                return (
                  <ClientSideHoverFreeze src={p.src}>
                    <Image info={info} {...p} loading="lazy" />
                  </ClientSideHoverFreeze>
                );
              }
              return <Image info={info} {...p} loading="lazy" />;
            }}
            renderViewer={(p) => <ImageViewer {...p} />}
          />
        )}
        outlined={outlineAttachment}
      />,
      isGallery
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
      />,
      isGallery
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
        fitParent={isGallery}
      />
    );
  }

  if (msgType === (MsgType.File as string)) return renderFile();
  if (msgType === (MsgType.Location as string))
    return <MLocation showMaps={showMaps} content={content} />;

  if (msgType === GALLERY_MSGTYPE) {
    return renderCaptionedAttachment(
      <MGallery
        content={content as IGalleryContent}
        renderItem={(itemContent) => (
          <RenderMessageContentInternal
            displayName={displayName}
            msgType={itemContent.msgtype as string}
            ts={ts}
            getContent={() => itemContent}
            mediaAutoLoad={mediaAutoLoad}
            urlPreview={urlPreview}
            highlightRegex={highlightRegex}
            htmlReactParserOptions={htmlReactParserOptions}
            linkifyOpts={linkifyOpts}
            outlineAttachment={outlineAttachment}
            isGallery={true}
          />
        )}
      />
    );
  }

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
  if (content[M_POLL_START.name]) {
    if (mEvent && mx && room)
      return <PollEvent content={content} mEvent={mEvent} mx={mx} room={room} />;
    else return <UnsupportedContent />;
  }
  return (
    <UnsupportedContent
      body={
        (content as { body?: string }).body ??
        (content as { [M_TEXT.name]?: string })[M_TEXT.name] ??
        (content as { [M_TEXT.name]?: { body: string } })[M_TEXT.name]?.body ??
        ''
      }
    />
  );
}

export const RenderMessageContent = memo(RenderMessageContentInternal);
