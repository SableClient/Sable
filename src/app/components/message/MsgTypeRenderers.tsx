import type { CSSProperties, ReactNode } from 'react';
import { useMemo } from 'react';
import { Box, Chip, Text, toRem } from 'folds';
import { ArrowSquareOut, sizedIcon, Link } from '$components/icons/phosphor';
import type { IContent, IPreviewUrlResponse, MatrixClient } from '$types/matrix-sdk';
import { JUMBO_EMOJI_REG } from '$utils/regex';
import { trimReplyFromBody } from '$utils/room';
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
import { mxcUrlToHttp } from '$utils/matrix';
import { getScopedMediaCacheKey } from '$utils/mediaTransport';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import type { PerMessageProfileBeeperFormat } from '$hooks/usePerMessageProfile';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useMediaMetadata } from '$hooks/useMediaMetadata';
import type { CachedMediaMetadata } from '$utils/mediaMetadata';
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
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';

import * as css from './MsgTypeRenderers.css';
import { markerIcon } from '$features/room/location-modal/LocationDialog';

export interface BundleContent extends IPreviewUrlResponse {
  matched_url: string;
}

const positiveMediaDimension = (value: number | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

const mergeImageInfoWithMetadata = (
  info: IImageInfo | undefined,
  metadata: CachedMediaMetadata | undefined
): IImageInfo | undefined => {
  if (!metadata) return info;

  const width = positiveMediaDimension(info?.w) ?? metadata.width;
  const height = positiveMediaDimension(info?.h) ?? metadata.height;
  const size = positiveMediaDimension(info?.size) ?? metadata.byteSize;
  const mimetype = info?.mimetype ?? metadata.mimeType;

  if (!width && !height && !size && !mimetype) return info;

  return {
    ...info,
    ...(width ? { w: width } : {}),
    ...(height ? { h: height } : {}),
    ...(size ? { size } : {}),
    ...(mimetype ? { mimetype } : {}),
  };
};

const mergeVideoInfoWithMetadata = (
  info: (IVideoInfo & IThumbnailContent) | undefined,
  metadata: CachedMediaMetadata | undefined
): (IVideoInfo & IThumbnailContent) | undefined => {
  if (!metadata) return info;

  const width = positiveMediaDimension(info?.w) ?? metadata.width;
  const height = positiveMediaDimension(info?.h) ?? metadata.height;
  const size = positiveMediaDimension(info?.size) ?? metadata.byteSize;
  const duration = positiveMediaDimension(info?.duration) ?? metadata.duration;
  const mimetype =
    info?.mimetype ?? metadata.mimeType ?? (metadata.kind === 'video' ? 'video/mp4' : undefined);

  if (!width && !height && !size && !duration && !mimetype) return info;

  return {
    ...info,
    ...(width ? { w: width } : {}),
    ...(height ? { h: height } : {}),
    ...(size ? { size } : {}),
    ...(duration ? { duration } : {}),
    ...(mimetype ? { mimetype } : {}),
  };
};

const useAttachmentMetadataKey = (
  mxcUrl: string | undefined,
  encrypted: boolean
): string | undefined => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  return useMemo(() => {
    if (!mxcUrl) return undefined;
    if (encrypted) return getScopedMediaCacheKey(mxcUrl);
    if (mxcUrl.startsWith('http')) return getScopedMediaCacheKey(mxcUrl);

    const mediaUrl = mxcUrlToHttp(mx, mxcUrl, useAuthentication);
    return mediaUrl ? getScopedMediaCacheKey(mediaUrl) : undefined;
  }, [encrypted, mx, mxcUrl, useAuthentication]);
};

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

export function BrokenContent({ body }: BrokenContentProps) {
  return (
    <Text>
      <MessageBrokenContent body={body} />
    </Text>
  );
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
  composeBundledPreviewsWithUrls?: boolean;
  style?: CSSProperties;
};

const isPreviewSuppressedUrl = (
  body: string,
  fullMatch: string,
  url: string,
  offset: number
): boolean => {
  const urlIndex = body.indexOf(url, offset);
  if (urlIndex === -1) return false;

  if (body.slice(urlIndex - 1, urlIndex + url.length + 1) === `<${url}>`) return true;
  if (offset >= 3 && body.slice(offset - 3, offset) === '](<') return true;
  if (fullMatch.startsWith('(') && body.slice(urlIndex - 2, urlIndex) === '(<') return true;

  return false;
};

const getUrlsFromContent = (
  content: Record<string, unknown>,
  renderUrlsPreview?: (urls: string[]) => ReactNode
): { urls?: string[]; bundleContent?: BundleContent[] } => {
  try {
    const body = typeof content.body === 'string' ? content.body : '';
    const customBody =
      typeof content.formatted_body === 'string' ? content.formatted_body : undefined;
    const trimmedBody = trimReplyFromBody(body);

    const urlsMatch = [...trimmedBody.matchAll(LINKINPUTREGEX)];
    let urls: string[] | undefined = urlsMatch
      .map((match) => {
        const full = match[0];
        const url = match[1];
        const offset = match.index ?? 0;
        if (typeof url !== 'string') return undefined;
        if (isPreviewSuppressedUrl(trimmedBody, full, url, offset)) return undefined;
        return url;
      })
      .filter((url): url is string => Boolean(url));
    urls = urls.length > 0 ? [...new Set(urls)] : undefined;

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
      if (renderUrlsPreview && bundleContent) {
        const bundleUrls = bundleContent.map((bundle) => bundle.matched_url);
        urls = [...new Set([...(urls ?? []), ...bundleUrls])];
      }
    } catch (innerError) {
      console.warn('[getUrlsFromContent] Failed to process bundleContent:', innerError);
      urls = [];
    }

    return { urls, bundleContent };
  } catch (error) {
    console.warn('[getUrlsFromContent] Failed to extract URLs from message content:', error);
    // Return empty to allow message to render without link previews
    return { urls: undefined, bundleContent: undefined };
  }
};

export function MText({
  edited,
  content,
  renderBody,
  renderUrlsPreview,
  renderBundledPreviews,
  composeBundledPreviewsWithUrls,
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
  const unwrappedPerMessageProfileMessage = useMemo(
    () =>
      cleanedMessage?.replace(/<strong[^>]*data-mx-profile-fallback[^>]*>(.*?):\s*<\/strong>/i, ''),
    [cleanedMessage]
  );

  const isJumbo = useMemo(() => {
    if (!trimmedBody || trimmedBody.length >= 500) return false;
    if (
      (unwrappedPerMessageProfileMessage ?? cleanedMessage ?? customBody)?.match(
        /^(<img[^>]*data-mx-emoticon[^>]*\/>){1,20}$/i
      )
    )
      return true;
    if (!JUMBO_EMOJI_REG.test(trimmedBody)) return false;

    if (trimmedBody.includes(':')) {
      const hasImage = customBody && /<img[^>]*>/i.test(customBody);
      if (!hasImage) return false;
    }

    return true;
  }, [unwrappedPerMessageProfileMessage, cleanedMessage, trimmedBody, customBody]);

  const { urls, bundleContent } = getUrlsFromContent(content, renderUrlsPreview);
  const renderedUrlsPreview =
    renderUrlsPreview && urls && urls.length > 0 && renderUrlsPreview(urls);
  const renderedBundledPreviews =
    renderBundledPreviews &&
    bundleContent &&
    bundleContent.length > 0 &&
    renderBundledPreviews(bundleContent as IPreviewUrlResponse[]);
  const renderedPreviews = composeBundledPreviewsWithUrls ? (
    <>
      {renderedUrlsPreview}
      {renderedBundledPreviews}
    </>
  ) : (
    renderedUrlsPreview || renderedBundledPreviews
  );

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
            customBody: unwrappedPerMessageProfileMessage,
          })}
          {edited && <MessageEditedContent />}
        </MessageTextBody>
        {renderedPreviews}
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
        {renderedPreviews}
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
      {renderedPreviews}
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
  composeBundledPreviewsWithUrls?: boolean;
};
export function MEmote({
  displayName,
  edited,
  content,
  renderBody,
  renderUrlsPreview,
  renderBundledPreviews,
  composeBundledPreviewsWithUrls,
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
  const isJumbo = JUMBO_EMOJI_REG.test(trimmedBody);

  const { urls, bundleContent } = getUrlsFromContent(content, renderUrlsPreview);
  const renderedUrlsPreview =
    renderUrlsPreview && urls && urls.length > 0 && renderUrlsPreview(urls);
  const renderedBundledPreviews =
    renderBundledPreviews &&
    bundleContent &&
    bundleContent.length > 0 &&
    renderBundledPreviews(bundleContent as IPreviewUrlResponse[]);
  const renderedPreviews = composeBundledPreviewsWithUrls ? (
    <>
      {renderedUrlsPreview}
      {renderedBundledPreviews}
    </>
  ) : (
    renderedUrlsPreview || renderedBundledPreviews
  );

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
      {renderedPreviews}
    </>
  );
}

type MNoticeProps = {
  edited?: boolean;
  content: Record<string, unknown>;
  renderBody: (props: RenderBodyProps) => ReactNode;
  renderUrlsPreview?: (urls: string[]) => ReactNode;
  renderBundledPreviews?: (bundles: IPreviewUrlResponse[]) => ReactNode;
  composeBundledPreviewsWithUrls?: boolean;
};
export function MNotice({
  edited,
  content,
  renderBody,
  renderUrlsPreview,
  renderBundledPreviews,
  composeBundledPreviewsWithUrls,
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
  const isJumbo = JUMBO_EMOJI_REG.test(trimmedBody);

  const { urls, bundleContent } = getUrlsFromContent(content, renderUrlsPreview);
  const renderedUrlsPreview =
    renderUrlsPreview && urls && urls.length > 0 && renderUrlsPreview(urls);
  const renderedBundledPreviews =
    renderBundledPreviews &&
    bundleContent &&
    bundleContent.length > 0 &&
    renderBundledPreviews(bundleContent as IPreviewUrlResponse[]);
  const renderedPreviews = composeBundledPreviewsWithUrls ? (
    <>
      {renderedUrlsPreview}
      {renderedBundledPreviews}
    </>
  ) : (
    renderedUrlsPreview || renderedBundledPreviews
  );

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
      {renderedPreviews}
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
};
export function MImage({ content, renderImageContent, outlined }: MImageProps) {
  const mxcUrl = content.file?.url ?? content.url;
  const mediaMetadataKey = useAttachmentMetadataKey(
    typeof mxcUrl === 'string' ? mxcUrl : undefined,
    Boolean(content.file)
  );
  const mediaMetadata = useMediaMetadata(mediaMetadataKey);
  const imgInfo = mergeImageInfoWithMetadata(content?.info, mediaMetadata);

  if (typeof mxcUrl !== 'string') {
    return <BrokenContent body={content.body ?? content.filename} />;
  }
  const MAX_SIZE = 400;
  const imgW = imgInfo?.w ?? MAX_SIZE;
  const imgH = imgInfo?.h ?? MAX_SIZE;
  const aspectRatio = imgInfo?.w && imgInfo?.h ? `${imgW} / ${imgH}` : undefined;
  // this garbage is for portrait images, we cap the width so the card doesn't exceed the bounds of the image
  const displayWidth = imgH > imgW ? Math.round(MAX_SIZE * (imgW / imgH)) : MAX_SIZE;

  return (
    <Attachment
      style={{
        flexGrow: 1,
        flexShrink: 0,
        width: toRem(displayWidth),
      }}
      outlined={outlined}
    >
      <AttachmentBox
        style={{
          aspectRatio,
          maxHeight: toRem(MAX_SIZE),
        }}
      >
        {renderImageContent({
          body: content.filename || content.body || 'Image',
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
};
export function MVideo({ content, renderAsFile, renderVideoContent, outlined }: MVideoProps) {
  const mxcUrl = content.file?.url ?? content.url;
  const mediaMetadataKey = useAttachmentMetadataKey(
    typeof mxcUrl === 'string' ? mxcUrl : undefined,
    Boolean(content.file)
  );
  const mediaMetadata = useMediaMetadata(mediaMetadataKey);
  const videoInfo = mergeVideoInfoWithMetadata(content?.info, mediaMetadata);
  const safeMimeType = getBlobSafeMimeType(videoInfo?.mimetype ?? '');

  if (!videoInfo || !safeMimeType.startsWith('video') || typeof mxcUrl !== 'string') {
    if (mxcUrl) {
      return renderAsFile();
    }
    return <BrokenContent body={content.body ?? content.filename} />;
  }

  const height = Math.min(scaleYDimension(videoInfo.w || 400, 400, videoInfo.h || 400), 400);

  const filename = content.filename ?? content.body ?? 'Video';

  return (
    <Attachment
      style={{
        flexGrow: 1,
        flexShrink: 0,
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
};
export function MAudio({ content, renderAsFile, renderAudioContent, outlined }: MAudioProps) {
  const audioInfo = content?.info;
  const mxcUrl = content.file?.url ?? content.url;
  const safeMimeType = getBlobSafeMimeType(audioInfo?.mimetype ?? '');

  if (!audioInfo || !safeMimeType.startsWith('audio') || typeof mxcUrl !== 'string') {
    if (mxcUrl) {
      return renderAsFile();
    }
    return <BrokenContent body={content.body ?? content.filename} />;
  }

  const filename = content.filename ?? content.body ?? 'Audio';
  const durationMs = getAudioDurationMs(content, audioInfo);
  const resolvedInfo =
    durationMs !== undefined ? { ...audioInfo, duration: durationMs } : audioInfo;
  return (
    <Attachment outlined={outlined}>
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
  body: string;
  info: IFileInfo & IThumbnailContent;
  mimeType: string;
  url: string;
  encInfo?: IEncryptedFile;
};
type MFileProps = {
  content: IFileContent;
  renderFileContent: (props: RenderFileContentProps) => ReactNode;
  outlined?: boolean;
};
export function MFile({ content, renderFileContent, outlined }: MFileProps) {
  const fileInfo = content?.info;
  const mxcUrl = content.file?.url ?? content.url;

  if (typeof mxcUrl !== 'string') {
    return <BrokenContent body={content.body ?? content.filename} />;
  }

  return (
    <Attachment outlined={outlined}>
      <AttachmentHeader>
        <FileHeader
          body={content.filename ?? content.body ?? 'Unnamed File'}
          mimeType={fileInfo?.mimetype ?? FALLBACK_MIMETYPE}
        />
      </AttachmentHeader>
      <AttachmentBox>
        <AttachmentContent>
          {renderFileContent({
            body: content.filename ?? content.body ?? 'File',
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

function isValidGeoCoord(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function MLocation({ content, showMaps }: MLocationProps) {
  const geoUri = content.geo_uri;
  if (typeof geoUri !== 'string') {
    return <BrokenContent body={typeof content.body === 'string' ? content.body : undefined} />;
  }
  const location = parseGeoUri(geoUri);
  if (!location) return <BrokenContent />;
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!isValidGeoCoord(latitude, longitude)) {
    return <BrokenContent body={typeof content.body === 'string' ? content.body : undefined} />;
  }
  const coords: LatLngExpression = [latitude, longitude];
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
          onClick={() => copyToClipboard(`${latitude}, ${longitude}`)}
          before={sizedIcon(Link, '50')}
          className={css.LocationCoordsChip}
        >
          <Text size="T400">{`${latitude}, ${longitude}`}</Text>
        </Chip>

        <Chip
          as="a"
          size="400"
          href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`}
          target="_blank"
          rel="noreferrer noopener"
          variant="Primary"
          radii="Pill"
          className={css.LocationExternalChip}
          before={sizedIcon(ArrowSquareOut, '50')}
        >
          <Text size="B300">Open Location</Text>
        </Chip>
      </Box>
      {showMaps && (
        <MapContainer
          center={coords}
          zoom={16}
          scrollWheelZoom={true}
          className={css.LocationMapContainer}
          attributionControl
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker
            position={coords}
            eventHandlers={{
              mousedown: (e) => {
                e.originalEvent.preventDefault();
                e.originalEvent.stopPropagation();
              },
            }}
            icon={markerIcon}
          />
        </MapContainer>
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
  const mxcUrl = content.file?.url ?? content.url;
  if (typeof mxcUrl !== 'string') {
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
