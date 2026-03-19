import { CSSProperties, ReactNode, useMemo } from 'react';
import { Box, Chip, Icon, Icons, Text, toRem } from 'folds';
import { IContent } from '$types/matrix-sdk';
import { JUMBO_EMOJI_REG, URL_REG } from '$utils/regex';
import { trimReplyFromBody } from '$utils/room';
import {
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
  MATRIX_SPOILER_PROPERTY_NAME,
  MATRIX_SPOILER_REASON_PROPERTY_NAME,
} from '$types/matrix/common';
import { FALLBACK_MIMETYPE, getBlobSafeMimeType } from '$utils/mimeTypes';
import { parseGeoUri, scaleYDimension } from '$utils/common';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Attachment, AttachmentBox, AttachmentContent, AttachmentHeader } from './attachment';
import { FileHeader, FileDownloadButton } from './FileHeader';
import {
  MessageBadEncryptedContent,
  MessageBrokenContent,
  MessageDeletedContent,
  MessageEditedContent,
  MessageUnsupportedContent,
} from './content';
import { MessageTextBody } from './layout';
import { unwrapForwardedContent } from './modals/MessageForward';

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
  style?: CSSProperties;
};
export function MText({ edited, content, renderBody, renderUrlsPreview, style }: MTextProps) {
  const [jumboEmojiSize] = useSetting(settingsAtom, 'jumboEmojiSize');

  const body = typeof content.body === 'string' ? content.body : '';
  const customBody =
    typeof content.formatted_body === 'string' ? content.formatted_body : undefined;

  const trimmedBody = useMemo(() => trimReplyFromBody(body), [body]);
  const unwrappedForwardedContent = useMemo(
    () => unwrapForwardedContent(customBody ?? body),
    [customBody, body]
  );

  const safeCustomBody = useMemo(() => {
    if (!customBody) return undefined;
    if (customBody.length > 8000) {
      const imageTags = customBody.match(/<img[^>]*>/g);
      return imageTags ? imageTags.join(' ') : undefined;
    }
    return customBody;
  }, [customBody]);

  const isForwarded = useMemo(() => {
    const forwardMeta = content['moe.sable.message.forward'];
    return typeof forwardMeta === 'object';
  }, [content]);
  const isJumbo = useMemo(() => {
    if (!trimmedBody || trimmedBody.length >= 500) return false;
    if (!JUMBO_EMOJI_REG.test(trimmedBody)) return false;

    if (trimmedBody.includes(':')) {
      const hasImage = safeCustomBody && /<img[^>]*>/i.test(safeCustomBody);
      if (!hasImage) return false;
    }

    return true;
  }, [trimmedBody, safeCustomBody]);

  if (!body && !customBody) return <BrokenContent body={customBody ?? body} />;

  const urlsMatch = renderUrlsPreview && trimmedBody.match(URL_REG);
  const urls = urlsMatch ? [...new Set(urlsMatch)] : undefined;

  if (isForwarded && unwrappedForwardedContent) {
    return (
      <MessageTextBody preWrap={typeof unwrappedForwardedContent !== 'string'} style={style}>
        {renderBody({
          body: trimmedBody,
          customBody: unwrappedForwardedContent,
        })}
        {edited && <MessageEditedContent />}
        {renderUrlsPreview && urls && urls.length > 0 && renderUrlsPreview(urls)}
      </MessageTextBody>
    );
  }

  return (
    <>
      <MessageTextBody
        preWrap={typeof safeCustomBody !== 'string'}
        jumboEmoji={isJumbo ? jumboEmojiSize : 'none'}
        style={style}
      >
        {renderBody({
          body: trimmedBody,
          customBody: safeCustomBody,
        })}
        {edited && <MessageEditedContent />}
      </MessageTextBody>
      {renderUrlsPreview && urls && urls.length > 0 && renderUrlsPreview(urls)}
    </>
  );
}

type MEmoteProps = {
  displayName: string;
  edited?: boolean;
  content: Record<string, unknown>;
  renderBody: (props: RenderBodyProps) => ReactNode;
  renderUrlsPreview?: (urls: string[]) => ReactNode;
};
export function MEmote({
  displayName,
  edited,
  content,
  renderBody,
  renderUrlsPreview,
}: MEmoteProps) {
  const { body, formatted_body: customBody } = content;
  const [jumboEmojiSize] = useSetting(settingsAtom, 'jumboEmojiSize');

  if (typeof body !== 'string') {
    return <BrokenContent body={typeof customBody === 'string' ? customBody : undefined} />;
  }
  const trimmedBody = trimReplyFromBody(body);
  const urlsMatch = renderUrlsPreview && trimmedBody.match(URL_REG);
  const urls = urlsMatch ? [...new Set(urlsMatch)] : undefined;
  const isJumbo = JUMBO_EMOJI_REG.test(trimmedBody);

  return (
    <>
      <MessageTextBody
        emote
        preWrap={typeof customBody !== 'string'}
        jumboEmoji={isJumbo ? jumboEmojiSize : 'none'}
      >
        <b>{`${displayName} `}</b>
        {renderBody({
          body: trimmedBody,
          customBody: typeof customBody === 'string' ? customBody : undefined,
        })}
        {edited && <MessageEditedContent />}
      </MessageTextBody>
      {renderUrlsPreview && urls && urls.length > 0 && renderUrlsPreview(urls)}
    </>
  );
}

type MNoticeProps = {
  edited?: boolean;
  content: Record<string, unknown>;
  renderBody: (props: RenderBodyProps) => ReactNode;
  renderUrlsPreview?: (urls: string[]) => ReactNode;
};
export function MNotice({ edited, content, renderBody, renderUrlsPreview }: MNoticeProps) {
  const { body, formatted_body: customBody } = content;
  const [jumboEmojiSize] = useSetting(settingsAtom, 'jumboEmojiSize');

  if (typeof body !== 'string') {
    return <BrokenContent body={typeof customBody === 'string' ? customBody : undefined} />;
  }
  const trimmedBody = trimReplyFromBody(body);
  const urlsMatch = renderUrlsPreview && trimmedBody.match(URL_REG);
  const urls = urlsMatch ? [...new Set(urlsMatch)] : undefined;
  const isJumbo = JUMBO_EMOJI_REG.test(trimmedBody);

  return (
    <>
      <MessageTextBody
        notice
        preWrap={typeof customBody !== 'string'}
        jumboEmoji={isJumbo ? jumboEmojiSize : 'none'}
      >
        {renderBody({
          body: trimmedBody,
          customBody: typeof customBody === 'string' ? customBody : undefined,
        })}
        {edited && <MessageEditedContent />}
      </MessageTextBody>
      {renderUrlsPreview && urls && urls.length > 0 && renderUrlsPreview(urls)}
    </>
  );
}

type RenderImageContentProps = {
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
  const imgInfo = content?.info;
  const mxcUrl = content.file?.url ?? content.url;
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
          body: content.filename || 'Image',
          info: imgInfo,
          mimeType: imgInfo?.mimetype,
          url: mxcUrl,
          encInfo: content.file,
          markedAsSpoiler: content[MATRIX_SPOILER_PROPERTY_NAME],
          spoilerReason: content[MATRIX_SPOILER_REASON_PROPERTY_NAME],
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
  const videoInfo = content?.info;
  const mxcUrl = content.file?.url ?? content.url;
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
          markedAsSpoiler: content[MATRIX_SPOILER_PROPERTY_NAME],
          spoilerReason: content[MATRIX_SPOILER_REASON_PROPERTY_NAME],
        })}
      </AttachmentBox>
    </Attachment>
  );
}

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
            info: audioInfo,
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
};
export function MLocation({ content }: MLocationProps) {
  const geoUri = content.geo_uri;
  if (typeof geoUri !== 'string') {
    return <BrokenContent body={typeof content.body === 'string' ? content.body : undefined} />;
  }
  const location = parseGeoUri(geoUri);
  if (!location) return <BrokenContent />;

  return (
    <Box direction="Column" alignItems="Start" gap="100">
      <Text size="T400">{geoUri}</Text>
      <Chip
        as="a"
        size="400"
        href={`https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=16/${location.latitude}/${location.longitude}`}
        target="_blank"
        rel="noreferrer noopener"
        variant="Primary"
        radii="Pill"
        before={<Icon src={Icons.External} size="50" />}
      >
        <Text size="B300">Open Location</Text>
      </Chip>
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
