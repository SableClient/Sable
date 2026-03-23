import { useCallback, useEffect, useState, ReactNode } from 'react';
import { Box, Badge, Icon, IconButton, Icons, Spinner, Text, as, toRem } from 'folds';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { encodeBlurHash } from '$utils/blurHash';
import { MATRIX_BLUR_HASH_PROPERTY_NAME } from '$types/matrix/common';
import { Attachment, AttachmentBox, AttachmentHeader } from '../message/attachment';
import { Image } from '../media';
import { UrlPreview } from './UrlPreview';
import { VideoContent } from '../message';

interface OEmbed {
  type: 'photo' | 'video' | 'link' | 'rich';
  version: '1.0';
  title?: string;
  author_name?: string;
  author_url?: string;
  provider_name?: string;
  provider_url?: string;
  cache_age?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  url?: string;
  html?: string;
  width?: number;
  height?: number;
}

async function oEmbedData(url: string): Promise<OEmbed> {
  const data = await fetch(url).then((resp) => resp.json());

  return data;
}

export type EmbedHeaderProps = {
  title: string;
  source: string;
  after?: ReactNode;
};
export const EmbedHeader = as<'div', EmbedHeaderProps>(({ title, source, after }) => (
  <AttachmentHeader>
    <Box alignItems="Center" gap="200" grow="Yes">
      <Box shrink="No">
        <Badge style={{ maxWidth: toRem(100) }} variant="Secondary" radii="Pill">
          <Text size="O400" truncate>
            {source}
          </Text>
        </Badge>
      </Box>
      <Box grow="Yes">
        <Text size="T300" truncate>
          {title}
        </Text>
      </Box>
      {after}
    </Box>
  </AttachmentHeader>
));

type EmbedOpenButtonProps = {
  url: string;
};
export function EmbedOpenButton({ url }: EmbedOpenButtonProps) {
  return (
    <IconButton size="300" radii="300" onClick={() => window.open(url, '_blank')}>
      <Icon size="100" src={Icons.Link} />
    </IconButton>
  );
}

type YoutubeElementProps = {
  videoId: string;
  embedData: OEmbed;
};

export const YoutubeElement = as<'div', YoutubeElementProps>(({ videoId, embedData }) => {
  const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const iframeSrc = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1`;
  const videoUrl = `https://youtube.com/watch?v=${videoId}`;

  const [blurHash, setBlurHash] = useState<string | undefined>();

  const title = embedData.title ? embedData.title : '';

  return (
    <Attachment
      style={{
        flexGrow: 1,
        flexShrink: 0,
        width: '640px',
        height: '400px',
      }}
    >
      <AttachmentHeader>
        <EmbedHeader title={title} source="YOUTUBE" after={EmbedOpenButton({ url: videoUrl })} />
      </AttachmentHeader>
      <AttachmentBox
        style={{
          height: '100%',
          width: '100%',
        }}
      >
        <VideoContent
          body={title}
          mimeType="fake"
          url={videoUrl}
          info={{
            thumbnail_info: { [MATRIX_BLUR_HASH_PROPERTY_NAME]: blurHash },
          }}
          renderThumbnail={() => (
            <Image
              src={thumbnailUrl}
              /*
								this allows the blurhash to be computed, otherwise it throws an "insecure operation" error
								maybe that happens for a good reason, in which case this should probably be removed
								*/
              crossOrigin="anonymous"
              onLoad={(e) => {
                setBlurHash(encodeBlurHash(e.currentTarget, 32, 32));
              }}
            />
          )}
          renderVideo={({ onLoadedMetadata }) => (
            <iframe
              src={iframeSrc}
              title="YouTube embed"
              onLoad={onLoadedMetadata}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              width="640"
              height="360"
              allowFullScreen
            />
          )}
        />
      </AttachmentBox>
    </Attachment>
  );
});

const youtubeUrl = (url: string) => url.match(/(https:\/\/)(www\.|m\.|)(youtube\.com|youtu\.be)\//);

export const ClientPreview = as<'div', { url: string }>(({ url, ...props }, ref) => {
  const [showYoutube] = useSetting(settingsAtom, 'clientPreviewYoutube');

  // this component is overly complicated, because it was designed to support more embed types than just youtube
  // i'm leaving this mess here to support later expansion
  const isYoutube = !!youtubeUrl(url);
  const videoId = isYoutube ? url.match(/(?:shorts\/|watch\?v=|youtu\.be\/)(.{11})/)?.[1] : null;

  const fetchUrl =
    isYoutube && videoId
      ? `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://youtube.com/watch?v=${videoId}`)}`
      : url;

  const [embedStatus, loadEmbed] = useAsyncCallback(
    useCallback(() => oEmbedData(fetchUrl), [fetchUrl])
  );

  useEffect(() => {
    const fetchYoutube = isYoutube && showYoutube;

    if (fetchYoutube) loadEmbed();
  }, [isYoutube, showYoutube, loadEmbed]);

  let previewContent;

  if (isYoutube && videoId) {
    if (showYoutube) {
      if (embedStatus.status === AsyncStatus.Error) return null;

      if (embedStatus.status === AsyncStatus.Success && embedStatus.data) {
        previewContent = <YoutubeElement videoId={videoId} embedData={embedStatus.data} />;
      } else {
        previewContent = (
          <Box grow="Yes" alignItems="Center" justifyContent="Center">
            <Spinner variant="Secondary" size="400" />
          </Box>
        );
      }
    }
  }

  return (
    <UrlPreview
      {...props}
      ref={ref}
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        boxShadow: 'none',
        display: 'inline-block',
        verticalAlign: 'middle',
        width: 'max-content',
        minWidth: 0,
        maxWidth: '100%',
        margin: 0,
      }}
    >
      {previewContent}
    </UrlPreview>
  );
});
