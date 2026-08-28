import { lazy, Suspense, type CSSProperties, type ReactNode, useMemo } from 'react';
import { ArrowSquareOut, sizedIcon, Link } from '$components/icons/phosphor';
import { Box, Chip, Text, toRem } from 'folds';
import { type IContent, type IPreviewUrlResponse, type MatrixClient } from '$types/matrix-sdk';
import { isJumboEmojiText } from '$utils/emojiDetection';
import { trimReplyFromBody } from '$utils/room/display';
import type {
  IAudioContent,
  IAudioInfo,
  IEncryptedFile,
  IFileContent,
  IFileInfo,
  IImageContent,
  IImageInfo,
  IThumbnailContent,
  IVideoContent,
  IVideoInfo,
} from '$types/matrix/common';
import * as prefix from '$unstable/prefixes';
import { FALLBACK_MIMETYPE, getBlobSafeMimeType } from '$utils/mimeTypes';
import { parseGeoUri, scaleYDimension } from '$utils/common';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import {
  stripPerMessageProfileFormattedBody,
  stripPerMessageProfilePlainBody,
  type PerMessageProfileBeeperFormat,
} from '$hooks/usePerMessageProfile';
import { Attachment, AttachmentBox, AttachmentContent, AttachmentHeader } from './attachment';
import { FileHeader, FileDownloadButton } from './FileHeader';
import {
  MessageBadEncryptedContent,
  MessageBrokenContent,
  MessageDeletedContent,
  MessageEditedContent,
  MessageUnsupportedContent,
  ReactionDeletedContent,
} from './content';
import { MessageTextBody } from './layout';
import { unwrapForwardedContent } from './modals/MessageForward';
import { LINKINPUTREGEX } from '$components/editor';
import { MATRIX_TO_BASE } from '$plugins/matrix-to';
import { copyToClipboard } from '$utils/dom';
import { getAttachmentFilename } from '$utils/download';
import * as css from './MsgTypeRenderers.css';
import { isNumber } from 'matrix-js-sdk/lib/utils';

const LocationMap = lazy(() =>
  import('./LocationMap').then((module) => ({ default: module.LocationMap }))
);

export interface BundleContent extends IPreviewUrlResponse {
  matched_url: string;
}

export function MBadEncrypted() {
  return (
    <Text>
      <MessageBadEncryptedContent />
    </Text>
  );
}

type RedactedContentProps = {
  reason?: string;
};
export function RedactedContent({ reason }: RedactedContentProps) {
  return (
    <Text>
      <MessageDeletedContent reason={reason} />
    </Text>
  );
}

type RedactedReactionContentProps = {
  reactionKey?: string;
  shortcode?: string;
  mx?: MatrixClient;
  useAuthentication?: boolean;
  reason?: string;
};
export function RedactedReactionContent({
  reactionKey,
  shortcode,
  mx,
  useAuthentication,
  reason,
}: RedactedReactionContentProps) {
  return (
    <Text>
      <ReactionDeletedContent
        reactionKey={reactionKey}
        shortcode={shortcode}
        mx={mx}
        useAuthentication={useAuthentication}
        reason={reason}
        hideIcon
      />
    </Text>
  );
}

type BrokenContentProps = {
  body?: string;
};

export function UnsupportedContent({ body }: BrokenContentProps) {
  return (
    <Text>
      <MessageUnsupportedContent body={body} />
    </Text>
  );
}

function BrokenContent({ body }: BrokenContentProps) {
  return (
    <Text>
      <MessageBrokenContent body={body} />
    </Text>
  );
}

export function getIncomingMediaMxcUrl(url: unknown): string | undefined {
  return typeof url === 'string' && url.startsWith('mxc://') ? url : undefined;
}

type RenderBodyProps = {
  body: string;
  customBody?: string;
};
type MTextProps = {
  edited?: boolean;
  content: Record<string, unknown>;
  renderBody: (props: RenderBodyProps) => ReactNode;
  renderUrlsPreview?: (urls: string[]) => ReactNode;
  renderBundledPreviews?: (bundles: IPreviewUrlResponse[]) => ReactNode;
  style?: CSSProperties;
};

const getUrlsFromContent = (
  content: Record<string, unknown>,
  renderUrlsPreview?: (urls: string[]) => ReactNode
): { urls?: string[]; bundleContent?: BundleContent[] } => {
  const body = typeof content.body === 'string' ? content.body : '';
  const customBody =
    typeof content.formatted_body === 'string' ? content.formatted_body : undefined;
  const trimmedBody = trimReplyFromBody(body);

  const urlsMatch = trimmedBody.match(LINKINPUTREGEX);
  let urls = urlsMatch ? [...new Set(urlsMatch)] : undefined;
  urls = urls?.map(
    (url) =>
      (url.startsWith('(') && url.endsWith(')') && url.substring(1, url.length - 1)) ||
      (url.startsWith('(') && url.substring(1)) ||
      (url.endsWith('/)') && url.substring(0, url.length - 1)) ||
      url
  );

  if (urls && customBody) {
    // Filter out URLs that only appear inside <code> or <pre> tags in the formatted body
    const safeHtml = customBody
      .replace(/<pre[^>]*>.*?<\/pre>/gs, '')
      .replace(/<code[^>]*>.*?<\/code>/gs, '');
    const safeText = safeHtml.replace(/<[^a][^>]*>/g, '');
    const safeUrlsMatch = safeText.match(LINKINPUTREGEX);
    let safeUrls = safeUrlsMatch ? [...new Set(safeUrlsMatch)] : [];
    safeUrls = safeUrls.map(
      (url) =>
        (url.startsWith('(') && url.endsWith(')') && url.substring(1, url.length - 1)) ||
        (url.startsWith('(') && url.substring(1)) ||
        (url.endsWith('/)') && url.substring(0, url.length - 1)) ||
        url
    );
    const safeUrlsSet = new Set(safeUrls);
    urls = urls.filter((url) => safeUrlsSet.has(url) && !url.startsWith(MATRIX_TO_BASE));
  }

  let bundleContent = content[
    prefix.MATRIX_UNSTABLE_EMBEDDED_LINK_PREVIEW_PROPERTY_NAME
  ] as BundleContent[];
  try {
    bundleContent = bundleContent?.filter((bundle) => !!urls?.includes(bundle.matched_url));
    if (renderUrlsPreview && bundleContent)
      urls = bundleContent.map((bundle) => bundle.matched_url);
  } catch {
    urls = [];
  }

  return { urls, bundleContent };
};

export function MText({
  edited,
  content,
  renderBody,
  renderUrlsPreview,
  renderBundledPreviews,
  style,
}: MTextProps) {
  const [jumboEmojiSize] = useSetting(settingsAtom, 'jumboEmojiSize');

  const body = typeof content.body === 'string' ? content.body : '';
  const customBody =
    typeof content.formatted_body === 'string' ? content.formatted_body : undefined;
  const cleanedMessage = useMemo(
    () => customBody?.replace(/<li>(<p><\/p>)?<\/li>/gi, '<li><br></li>'),
    [customBody]
  );

  const trimmedBody = useMemo(() => trimReplyFromBody(body), [body]);
  const unwrappedForwardedContent = useMemo(
    () => unwrapForwardedContent(cleanedMessage ?? customBody ?? body),
    [cleanedMessage, customBody, body]
  );

  const isForwarded = useMemo(() => {
    const forwardMeta = content[prefix.MATRIX_SABLE_UNSTABLE_MESSAGE_FORWARD_META_PROPERTY_NAME];
    return typeof forwardMeta === 'object';
  }, [content]);

  /**
   * For the unwrapping of per-message profile fallbacks, we look for <strong> tags with the data-mx-profile-fallback attribute
   */
  const hadPerMessageProfileFallback = useMemo(
    () => cleanedMessage?.match(/<strong[^>]*data-mx-profile-fallback[^>]*>(.*?):\s*<\/strong>/i),
    [cleanedMessage]
  );
  // the html body, with PMP fallback removed
  const unwrappedPmpCustomBody = useMemo(
    () => (cleanedMessage ? stripPerMessageProfileFormattedBody(cleanedMessage) : undefined),
    [cleanedMessage]
  );
  // the plain body, with PMP fallback removed
  const unwrappedPmpBody = useMemo(
    () =>
      hadPerMessageProfileFallback
        ? stripPerMessageProfilePlainBody(trimmedBody ?? '')
        : trimmedBody,
    [trimmedBody, hadPerMessageProfileFallback]
  );

  const isJumbo = useMemo(() => {
    if (!trimmedBody || trimmedBody.length >= 500) return false;
    if (
      (unwrappedPmpCustomBody ?? cleanedMessage ?? customBody)?.match(
        /^(<img[^>]*data-mx-emoticon[^>]*\/>){1,20}$/i
      )
    )
      return true;
    if (!isJumboEmojiText(unwrappedPmpBody)) return false;

    // we need to strip the plainbody fallback because it contains a colon
    if (unwrappedPmpBody.includes(':')) {
      const newCustomBody = hadPerMessageProfileFallback ? unwrappedPmpCustomBody : customBody;

      const hasImage = newCustomBody && /<img[^>]*>/i.test(newCustomBody);
      if (!hasImage) return false;
    }

    return true;
  }, [
    unwrappedPmpCustomBody,
    cleanedMessage,
    trimmedBody,
    customBody,
    unwrappedPmpBody,
    hadPerMessageProfileFallback,
  ]);

  const { urls, bundleContent } = getUrlsFromContent(content, renderUrlsPreview);

  if (
    (
      content[
        prefix.MATRIX_UNSTABLE_PER_MESSAGE_PROFILE_PROPERTY_NAME
      ] as PerMessageProfileBeeperFormat
    )?.has_fallback
  ) {
    // unwrap per-message profile fallback if present
    return (
      <>
        <MessageTextBody
          preWrap={typeof cleanedMessage !== 'string'}
          style={style}
          jumboEmoji={isJumbo ? jumboEmojiSize : 'none'}
        >
          {renderBody({
            body: trimmedBody,
            customBody: unwrappedPmpCustomBody,
          })}
          {edited && <MessageEditedContent />}
        </MessageTextBody>
        {(renderUrlsPreview && urls && urls.length > 0 && renderUrlsPreview(urls)) ||
          (renderBundledPreviews &&
            bundleContent &&
            bundleContent.length > 0 &&
            renderBundledPreviews(bundleContent as IPreviewUrlResponse[]))}
      </>
    );
  }

  if (isForwarded && unwrappedForwardedContent) {
    return (
      <MessageTextBody preWrap={typeof unwrappedForwardedContent !== 'string'} style={style}>
        {renderBody({
          body: trimmedBody,
          customBody: unwrappedForwardedContent,
        })}
        {edited && <MessageEditedContent />}
        {(renderUrlsPreview && urls && urls.length > 0 && renderUrlsPreview(urls)) ||
          (renderBundledPreviews &&
            bundleContent &&
            bundleContent.length > 0 &&
            renderBundledPreviews(bundleContent as IPreviewUrlResponse[]))}
      </MessageTextBody>
    );
  }

  return (
    <>
      <MessageTextBody
        preWrap={typeof cleanedMessage !== 'string'}
        jumboEmoji={isJumbo ? jumboEmojiSize : 'none'}
        style={style}
      >
        {renderBody({
          body: trimmedBody,
          customBody: typeof cleanedMessage === 'string' ? cleanedMessage : undefined,
        })}
        {edited && <MessageEditedContent />}
      </MessageTextBody>
      {(renderUrlsPreview && urls && urls.length > 0 && renderUrlsPreview(urls)) ||
        (renderBundledPreviews &&
          bundleContent &&
          bundleContent.length > 0 &&
          renderBundledPreviews(bundleContent as IPreviewUrlResponse[]))}
    </>
  );
}

type MEmoteProps = {
  displayName: string;
  edited?: boolean;
  content: Record<string, unknown>;
  renderBody: (props: RenderBodyProps) => ReactNode;
  renderUrlsPreview?: (urls: string[]) => ReactNode;
  renderBundledPreviews?: (bundles: IPreviewUrlResponse[]) => ReactNode;
};
export function MEmote({
  displayName,
  edited,
  content,
  renderBody,
  renderUrlsPreview,
  renderBundledPreviews,
}: MEmoteProps) {
  const { body, formatted_body: customBody } = content;
  const cleanedMessage = useMemo(
    () =>
      typeof customBody === 'string'
        ? customBody.replace(/<li>(<p><\/p>)?<\/li>/gi, '<li><br></li>')
        : undefined,
    [customBody]
  );
  const [jumboEmojiSize] = useSetting(settingsAtom, 'jumboEmojiSize');

  if (typeof body !== 'string') {
    return <BrokenContent body={typeof customBody === 'string' ? customBody : undefined} />;
  }
  const trimmedBody = trimReplyFromBody(body);
  const isJumbo = isJumboEmojiText(trimmedBody);

  const { urls, bundleContent } = getUrlsFromContent(content, renderUrlsPreview);

  return (
    <>
      <MessageTextBody
        emote
        preWrap={typeof cleanedMessage !== 'string'}
        jumboEmoji={isJumbo ? jumboEmojiSize : 'none'}
      >
        <b>{`${displayName} `}</b>
        {renderBody({
          body: trimmedBody,
          customBody: typeof cleanedMessage === 'string' ? cleanedMessage : undefined,
        })}
        {edited && <MessageEditedContent />}
      </MessageTextBody>
      {(renderUrlsPreview && urls && urls.length > 0 && renderUrlsPreview(urls)) ||
        (renderBundledPreviews &&
          bundleContent &&
          bundleContent.length > 0 &&
          renderBundledPreviews(bundleContent as IPreviewUrlResponse[]))}
    </>
  );
}

type MNoticeProps = {
  edited?: boolean;
  content: Record<string, unknown>;
  renderBody: (props: RenderBodyProps) => ReactNode;
  renderUrlsPreview?: (urls: string[]) => ReactNode;
  renderBundledPreviews?: (bundles: IPreviewUrlResponse[]) => ReactNode;
};
export function MNotice({
  edited,
  content,
  renderBody,
  renderUrlsPreview,
  renderBundledPreviews,
}: MNoticeProps) {
  const { body, formatted_body: customBody } = content;
  const cleanedMessage = useMemo(
    () =>
      typeof customBody === 'string'
        ? customBody.replace(/<li>(<p><\/p>)?<\/li>/gi, '<li><br></li>')
        : undefined,
    [customBody]
  );
  const [jumboEmojiSize] = useSetting(settingsAtom, 'jumboEmojiSize');

  if (typeof body !== 'string') {
    return <BrokenContent body={typeof customBody === 'string' ? customBody : undefined} />;
  }
  const trimmedBody = trimReplyFromBody(body);
  const isJumbo = isJumboEmojiText(trimmedBody);

  const { urls, bundleContent } = getUrlsFromContent(content, renderUrlsPreview);

  return (
    <>
      <MessageTextBody
        notice
        preWrap={typeof cleanedMessage !== 'string'}
        jumboEmoji={isJumbo ? jumboEmojiSize : 'none'}
      >
        {renderBody({
          body: trimmedBody,
          customBody: typeof cleanedMessage === 'string' ? cleanedMessage : undefined,
        })}
        {edited && <MessageEditedContent />}
      </MessageTextBody>
      {(renderUrlsPreview && urls && urls.length > 0 && renderUrlsPreview(urls)) ||
        (renderBundledPreviews &&
          bundleContent &&
          bundleContent.length > 0 &&
          renderBundledPreviews(bundleContent as IPreviewUrlResponse[]))}
    </>
  );
}

export type RenderImageContentProps = {
  body: string;
  filename?: string;
  info?: IImageInfo & IThumbnailContent;
  mimeType?: string;
  url: string;
  encInfo?: IEncryptedFile;
  markedAsSpoiler?: boolean;
  spoilerReason?: string;
};
type MImageProps = {
  content: IImageContent;
  renderImageContent: (props: RenderImageContentProps) => ReactNode;
  outlined?: boolean;
  fitParent?: boolean;
};
export function MImage({ content, renderImageContent, outlined, fitParent }: MImageProps) {
  const imgInfo = content?.info;
  const mxcUrl = getIncomingMediaMxcUrl(content.file?.url ?? content.url);
  if (!mxcUrl) {
    return <BrokenContent body={content.body ?? content.filename} />;
  }
  const MIN_SIZE = 150;
  const MAX_SIZE = 400;
  const filename = getAttachmentFilename(content.filename, content.body, 'Image');

  // lazy approach to make sure that both horizontal and vertical images fit
  // checks whether the image has width and height and if it does it sets a width that matches the aspect ratio
  const hasIntrinsicSize =
    isNumber(imgInfo?.w) && imgInfo.w > 0 && isNumber(imgInfo?.h) && imgInfo.h > 0;
  const portraitWidth =
    !imgInfo || !imgInfo.w || !imgInfo.h || imgInfo.w > imgInfo.h
      ? undefined
      : toRem((MAX_SIZE * imgInfo.w) / imgInfo.h);

  return (
    <Attachment
      style={{
        flexShrink: 0,
        width: fitParent ? '100%' : portraitWidth,
        height: fitParent ? '100%' : undefined,
        // A bare MAX_SIZE cap would drop the container's own `max-width: 100%`.
        maxWidth: fitParent ? undefined : `min(100%, ${toRem(MAX_SIZE)})`,
        maxHeight: fitParent ? undefined : toRem(MAX_SIZE),
        // ImageContent's aspect-ratio box already reserves the space when the
        // dimensions are known; a square floor on top of it letterboxes wide images.
        minWidth: fitParent || hasIntrinsicSize ? undefined : MIN_SIZE,
        minHeight: fitParent || hasIntrinsicSize ? undefined : MIN_SIZE,
      }}
      outlined={outlined}
    >
      <AttachmentBox
        style={{
          flexGrow: 1,
          width: fitParent ? '100%' : portraitWidth,
          height: fitParent ? '100%' : undefined,
        }}
      >
        {renderImageContent({
          body: content.body || content.filename || 'Image',
          filename,
          info: imgInfo,
          mimeType: imgInfo?.mimetype,
          url: mxcUrl,
          encInfo: content.file,
          markedAsSpoiler: content[prefix.MATRIX_UNSTABLE_SPOILER_PROPERTY_NAME],
          spoilerReason: content[prefix.MATRIX_UNSTABLE_SPOILER_REASON_PROPERTY_NAME],
        })}
      </AttachmentBox>
    </Attachment>
  );
}

type RenderVideoContentProps = {
  body: string;
  info: IVideoInfo & IThumbnailContent;
  mimeType: string;
  url: string;
  encInfo?: IEncryptedFile;
  markedAsSpoiler?: boolean;
  spoilerReason?: string;
};
type MVideoProps = {
  content: IVideoContent;
  renderAsFile: () => ReactNode;
  renderVideoContent: (props: RenderVideoContentProps) => ReactNode;
  outlined?: boolean;
  fitParent?: boolean;
};
export function MVideo({ content, renderAsFile, renderVideoContent, outlined }: MVideoProps) {
  const videoInfo = content?.info;
  const mxcUrl = getIncomingMediaMxcUrl(content.file?.url ?? content.url);
  const safeMimeType = getBlobSafeMimeType(videoInfo?.mimetype ?? '');

  if (!mxcUrl) {
    return <BrokenContent body={content.body ?? content.filename} />;
  }
  if (!videoInfo || !safeMimeType.startsWith('video')) return renderAsFile();

  const displayWidth = Math.min(videoInfo.w || 400, 400);
  const height = Math.min(scaleYDimension(videoInfo.w || 400, 400, videoInfo.h || 400), 400);

  const filename = getAttachmentFilename(content.filename, content.body, 'Video');

  return (
    <Attachment
      style={{
        flexGrow: 1,
        flexShrink: 0,
        width: toRem(displayWidth),
        height: 'auto',
      }}
      outlined={outlined}
    >
      <AttachmentHeader>
        <FileHeader
          body={filename}
          mimeType={safeMimeType}
          after={
            <FileDownloadButton
              filename={filename}
              url={mxcUrl}
              mimeType={safeMimeType}
              encInfo={content.file}
            />
          }
        />
      </AttachmentHeader>
      <AttachmentBox
        style={{
          flexGrow: 1,
          width: toRem(displayWidth),
          height: toRem(height < 48 ? 48 : height),
        }}
      >
        {renderVideoContent({
          body: content.body || 'Video',
          info: videoInfo,
          mimeType: safeMimeType,
          url: mxcUrl,
          encInfo: content.file,
          markedAsSpoiler: content[prefix.MATRIX_UNSTABLE_SPOILER_PROPERTY_NAME],
          spoilerReason: content[prefix.MATRIX_UNSTABLE_SPOILER_REASON_PROPERTY_NAME],
        })}
      </AttachmentBox>
    </Attachment>
  );
}

const getAudioDurationMs = (content: IAudioContent, info?: IAudioInfo): number | undefined => {
  const fromInfo = info?.duration;
  if (typeof fromInfo === 'number' && Number.isFinite(fromInfo) && fromInfo > 0) {
    return fromInfo;
  }
  const voiceV2 = (content as Record<string, unknown>)['org.matrix.msc3245.voice.v2'];
  if (voiceV2 && typeof voiceV2 === 'object') {
    const seconds = (voiceV2 as { duration?: number }).duration;
    if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  }
  const msc1767Audio = (content as Record<string, unknown>)['org.matrix.msc1767.audio'];
  if (msc1767Audio && typeof msc1767Audio === 'object') {
    const ms = (msc1767Audio as { duration?: number }).duration;
    if (typeof ms === 'number' && Number.isFinite(ms) && ms > 0) {
      return ms;
    }
  }
  return undefined;
};

type RenderAudioContentProps = {
  info: IAudioInfo;
  mimeType: string;
  url: string;
  encInfo?: IEncryptedFile;
};
type MAudioProps = {
  content: IAudioContent;
  renderAsFile: () => ReactNode;
  renderAudioContent: (props: RenderAudioContentProps) => ReactNode;
  outlined?: boolean;
  fitParent?: boolean;
};
export function MAudio({
  content,
  renderAsFile,
  renderAudioContent,
  outlined,
  fitParent,
}: MAudioProps) {
  const audioInfo = content?.info;
  const mxcUrl = getIncomingMediaMxcUrl(content.file?.url ?? content.url);
  const safeMimeType = getBlobSafeMimeType(audioInfo?.mimetype ?? '');

  if (!mxcUrl) {
    return <BrokenContent body={content.body ?? content.filename} />;
  }
  if (!audioInfo || !safeMimeType.startsWith('audio')) return renderAsFile();

  const filename = getAttachmentFilename(content.filename, content.body, 'Audio');
  const durationMs = getAudioDurationMs(content, audioInfo);
  const resolvedInfo =
    durationMs !== undefined ? { ...audioInfo, duration: durationMs } : audioInfo;
  return (
    <Attachment
      outlined={outlined}
      style={{ width: fitParent ? '100%' : toRem(400), height: fitParent ? '100%' : 'auto' }}
    >
      <AttachmentHeader>
        <FileHeader
          body={filename}
          mimeType={safeMimeType}
          after={
            <FileDownloadButton
              filename={filename}
              url={mxcUrl}
              mimeType={safeMimeType}
              encInfo={content.file}
            />
          }
        />
      </AttachmentHeader>
      <AttachmentBox>
        <AttachmentContent>
          {renderAudioContent({
            info: resolvedInfo,
            mimeType: safeMimeType,
            url: mxcUrl,
            encInfo: content.file,
          })}
        </AttachmentContent>
      </AttachmentBox>
    </Attachment>
  );
}

type RenderFileContentProps = {
  fileName: string;
  info: IFileInfo & IThumbnailContent;
  mimeType: string;
  url: string;
  encInfo?: IEncryptedFile;
};
type MFileProps = {
  content: IFileContent;
  renderFileContent: (props: RenderFileContentProps) => ReactNode;
  outlined?: boolean;
  fitParent?: boolean;
};
export function MFile({ content, renderFileContent, outlined }: MFileProps) {
  const fileInfo = content?.info;
  const mxcUrl = getIncomingMediaMxcUrl(content.file?.url ?? content.url);

  if (!mxcUrl) {
    return <BrokenContent body={content.body ?? content.filename} />;
  }

  const filename = getAttachmentFilename(content.filename, content.body, 'File');

  return (
    <Attachment outlined={outlined} style={{ width: toRem(400), height: 'auto' }}>
      <AttachmentHeader>
        <FileHeader body={filename} mimeType={fileInfo?.mimetype ?? FALLBACK_MIMETYPE} />
      </AttachmentHeader>
      <AttachmentBox>
        <AttachmentContent>
          {renderFileContent({
            fileName: filename,
            info: fileInfo ?? {},
            mimeType: fileInfo?.mimetype ?? FALLBACK_MIMETYPE,
            url: mxcUrl,
            encInfo: content.file,
          })}
        </AttachmentContent>
      </AttachmentBox>
    </Attachment>
  );
}

type MLocationProps = {
  content: IContent;
  showMaps?: boolean;
};
export function MLocation({ content, showMaps }: MLocationProps) {
  const geoUri = content.geo_uri;
  if (typeof geoUri !== 'string') {
    return <BrokenContent body={typeof content.body === 'string' ? content.body : undefined} />;
  }
  const location = parseGeoUri(geoUri);
  if (!location) return <BrokenContent />;
  const isValid = isNumber(Number(location.latitude)) && isNumber(Number(location.longitude));
  const coordinates: [number, number] = [Number(location.latitude), Number(location.longitude)];

  return (
    <Box
      direction="Column"
      className={css.LocationRendererBody}
      onPointerMove={(evt) => evt.stopPropagation()}
    >
      <Box
        direction="Row"
        alignItems="Center"
        gap="100"
        justifyContent="SpaceBetween"
        className={css.LocationRendererHeader}
      >
        <Chip
          size="400"
          variant="SurfaceVariant"
          onClick={() => copyToClipboard(`${location.latitude}, ${location.longitude}`)}
          before={sizedIcon(Link, '50')}
          className={css.LocationCoordsChip}
        >
          <Text size="T400">{`${location.latitude}, ${location.longitude}`}</Text>
        </Chip>

        <Chip
          as="a"
          size="400"
          href={
            isValid
              ? `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=16/${location.latitude}/${location.longitude}`
              : undefined
          }
          target="_blank"
          rel="noreferrer noopener"
          variant="Primary"
          radii="Pill"
          className={css.LocationExternalChip}
          before={sizedIcon(ArrowSquareOut, '50')}
          aria-disabled={!isValid}
        >
          <Text size="B300">Open Location</Text>
        </Chip>
      </Box>
      {showMaps && isValid && (
        <Suspense fallback={null}>
          <LocationMap coordinates={coordinates} className={css.LocationMapContainer} />
        </Suspense>
      )}
    </Box>
  );
}

type MStickerProps = {
  content: IImageContent;
  renderImageContent: (props: RenderImageContentProps) => ReactNode;
};
export function MSticker({ content, renderImageContent }: MStickerProps) {
  const imgInfo = content?.info;
  const mxcUrl = getIncomingMediaMxcUrl(content.file?.url ?? content.url);
  if (!mxcUrl) {
    return <MessageBrokenContent body={content.body} />;
  }
  const height = scaleYDimension(imgInfo?.w || 152, 152, imgInfo?.h || 152);

  return (
    <AttachmentBox
      style={{
        height: toRem(height < 48 ? 48 : height),
        width: toRem(152),
      }}
    >
      {renderImageContent({
        body: content.body || 'Sticker',
        info: imgInfo,
        mimeType: imgInfo?.mimetype,
        url: mxcUrl,
        encInfo: content.file,
      })}
    </AttachmentBox>
  );
}
