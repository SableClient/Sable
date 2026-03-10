import { memo, useMemo, useCallback } from 'react';
import { MsgType } from '$types/matrix-sdk';
import { testMatrixTo } from '$plugins/matrix-to';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom, CaptionPosition } from '$state/settings';
import { HTMLReactParserOptions } from 'html-react-parser';
import { Opts } from 'linkifyjs';
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
import { UrlPreviewCard, UrlPreviewHolder } from './url-preview';
import { Image, MediaControl, Video } from './media';
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
  getContent: <T>() => T;
  mediaAutoLoad?: boolean;
  urlPreview?: boolean;
  highlightRegex?: RegExp;
  htmlReactParserOptions: HTMLReactParserOptions;
  linkifyOpts: Opts;
  outlineAttachment?: boolean;
};

const getMediaType = (url: string) => {
  const cleanUrl = url.toLowerCase();
  if (cleanUrl.match(/\.(mp4|webm|ogg)$/i)) return 'video';
  if (cleanUrl.match(/\.(png|jpg|jpeg|gif|webp)$/i) || cleanUrl.match(/@(jpeg|webp|png|jpg)$/i))
    return 'image';
  return null;
};

const CAPTION_STYLE = { marginTop: config.space.S200 };

function RenderMessageContentInternal({
  displayName,
  msgType,
  ts,
  edited,
  getContent,
  mediaAutoLoad,
  urlPreview,
  highlightRegex,
  htmlReactParserOptions,
  linkifyOpts,
  outlineAttachment,
}: RenderMessageContentProps) {
  const content = useMemo(() => getContent<any>(), [getContent]);

  const [autoplayGifs] = useSetting(settingsAtom, 'autoplayGifs');
  const [captionPosition] = useSetting(settingsAtom, 'captionPosition');
  const captionPositionMap = {
    [CaptionPosition.Above]: 'column-reverse',
    [CaptionPosition.Below]: 'column',
    [CaptionPosition.Inline]: 'row',
    [CaptionPosition.Hidden]: 'row',
  } satisfies Record<CaptionPosition, React.CSSProperties['flexDirection']>;

  const renderBody = useCallback(
    (props: any) => (
      <RenderBody
        {...props}
        highlightRegex={highlightRegex}
        htmlReactParserOptions={htmlReactParserOptions}
        linkifyOpts={linkifyOpts}
      />
    ),
    [highlightRegex, htmlReactParserOptions, linkifyOpts]
  );

  const renderUrlsPreview = useCallback(
    (urls: string[]) => {
      const filteredUrls = urls.filter((url) => !testMatrixTo(url));
      if (filteredUrls.length === 0) return undefined;

      const analyzed = filteredUrls.map((url) => ({
        url,
        type: getMediaType(url),
      }));

      const mediaLinks = analyzed.filter((item) => item.type !== null);
      const toRender = mediaLinks.length > 0 ? mediaLinks : [analyzed[0]];

      return (
        <UrlPreviewHolder>
          {toRender.map(({ url, type }) => (
            <UrlPreviewCard key={url} url={url} ts={ts} mediaType={type} />
          ))}
        </UrlPreviewHolder>
      );
    },
    [ts]
  );

  const renderCaption = () => {
    const hasCaption = content.body && content.body.trim().length > 0;
    if (captionPosition === CaptionPosition.Hidden) return null;
    if (hasCaption && content.filename && content.filename !== content.body) {
      if (captionPosition !== CaptionPosition.Inline)
        return (
          <MText
            style={CAPTION_STYLE}
            edited={edited}
            content={content}
            renderBody={renderBody}
            renderUrlsPreview={urlPreview ? renderUrlsPreview : undefined}
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
            renderUrlsPreview={urlPreview ? renderUrlsPreview : undefined}
          />
        </Box>
      );
    }
    return null;
  };

  const renderFile = () => (
    <div
      style={{
        display: 'flex',
        flexDirection: captionPositionMap[captionPosition],
      }}
    >
      <div>
        <MFile
          content={content}
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
              <DownloadFile
                body={body}
                mimeType={mimeType}
                url={url}
                encInfo={encInfo}
                info={info}
              />
            </FileContent>
          )}
          outlined={outlineAttachment}
        />
      </div>
      {renderCaption()}
    </div>
  );

  if (msgType === MsgType.Text) {
    return (
      <MText
        edited={edited}
        content={content}
        renderBody={renderBody}
        renderUrlsPreview={urlPreview ? renderUrlsPreview : undefined}
      />
    );
  }

  if (msgType === MsgType.Emote) {
    if (content['fyi.cisnt.headpat']) {
      return (
        <MCuteEvent
          content={content}
          type={CuteEventType.Headpat}
          mentionedUserIds={content?.['m.mentions']?.user_ids}
        />
      );
    }
    return (
      <MEmote
        displayName={displayName}
        edited={edited}
        content={content}
        renderBody={renderBody}
        renderUrlsPreview={urlPreview ? renderUrlsPreview : undefined}
      />
    );
  }

  if (msgType === MsgType.Notice) {
    return (
      <MNotice
        edited={edited}
        content={content}
        renderBody={renderBody}
        renderUrlsPreview={urlPreview ? renderUrlsPreview : undefined}
      />
    );
  }

  if (msgType === MsgType.Image) {
    const isGif =
      content.info?.mimetype === 'image/gif' ||
      content.info?.mimetype === 'image/webp' ||
      content.body?.toLowerCase().endsWith('.gif') ||
      content.body?.toLowerCase().endsWith('.webp') ||
      (typeof content.url === 'string' && content.url.toLowerCase().includes('gif'));

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: captionPositionMap[captionPosition],
        }}
      >
        <div>
          <MImage
            content={content}
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
        </div>
        {renderCaption()}
      </div>
    );
  }

  if (msgType === MsgType.Video) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: captionPositionMap[captionPosition],
        }}
      >
        <div>
          <MVideo
            content={content}
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
                renderVideo={(p) => <Video {...p} />}
              />
            )}
            outlined={outlineAttachment}
          />
        </div>
        {renderCaption()}
      </div>
    );
  }

  if (msgType === MsgType.Audio) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: captionPositionMap[captionPosition],
        }}
      >
        <div>
          <MAudio
            content={content}
            renderAsFile={renderFile}
            renderAudioContent={(audioProps) => (
              <AudioContent {...audioProps} renderMediaControl={(p) => <MediaControl {...p} />} />
            )}
            outlined={outlineAttachment}
          />
        </div>
        {renderCaption()}
      </div>
    );
  }

  if (msgType === MsgType.File) return renderFile();
  if (msgType === MsgType.Location) return <MLocation content={content} />;
  if (msgType === 'm.bad.encrypted') return <MBadEncrypted />;

  // cute events
  if (msgType === 'im.fluffychat.cute_event')
    return (
      <MCuteEvent
        content={content}
        type={content?.cute_type}
        mentionedUserIds={content?.['m.mentions']?.user_ids}
      />
    );
  // as fallback to render older events where msgtype was set instead of m.emote with a custom property
  if (msgType === 'fyi.cisnt.headpat')
    return (
      <MCuteEvent
        content={content}
        type={CuteEventType.Headpat}
        mentionedUserIds={content?.['m.mentions']?.user_ids}
      />
    );
  return <UnsupportedContent body={content?.body} />;
}

export const RenderMessageContent = memo(RenderMessageContentInternal);
