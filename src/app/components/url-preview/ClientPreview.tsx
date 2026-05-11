import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Box, Badge, Icon, IconButton, Icons, Spinner, Text, as, toRem } from 'folds';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { encodeBlurHash } from '$utils/blurHash';
import { Attachment, AttachmentBox, AttachmentHeader } from '../message/attachment';
import { Image } from '../media';
import { UrlPreview } from './UrlPreview';
import { VideoContent } from '../message';
import { MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME } from '../../../unstable/prefixes';

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
  videoInfo: YoutubeLink;
  embedData: OEmbed;
};

export const YoutubeElement = as<'div', YoutubeElementProps>(({ videoInfo, embedData }) => {
  const thumbnailUrl = `https://i.ytimg.com/vi/${videoInfo.videoId}/hqdefault.jpg`;

  const timestamp = videoInfo.timestamp ? `&start=${videoInfo.timestamp}` : '';
  const playlist = videoInfo.playlist ? `&${videoInfo.playlist}` : '';

  const iframeSrc = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoInfo.videoId)}?autoplay=1${timestamp}`;
  const videoUrl = videoInfo.isMusic
    ? `https://music.youtube.com/watch?v=${videoInfo.videoId}${timestamp}${playlist}`
    : `https://youtube.com/watch?v=${videoInfo.videoId}${timestamp}${playlist}`;

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
            thumbnail_info: { [MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME]: blurHash },
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

export const youtubeUrl = (url: string) =>
  url.match(/(https:\/\/)(www\.|music\.|m\.|)(youtube\.com|youtu\.be)\//);

type YoutubeLink = {
  videoId: string;
  timestamp?: string;
  playlist?: string;
  isMusic: boolean;
};

function parseYoutubeLink(url: Readonly<string>): YoutubeLink | null {
  /**
   * the parsed version of `url`
   */
  let parsedURL: URL;
  try {
    parsedURL = new URL(url);
  } catch {
    // new URL can throw
    return null;
  }
  const urlHost = parsedURL.host;
  const urlSearchParams = parsedURL.searchParams;

  /**
   * The id of the youtube video, for example `MTn_bhTVr2U`
   */
  let videoId: string | undefined;

  if (urlHost === 'youtu.be' || urlHost.endsWith('.youtu.be')) {
    // example https://youtu.be/MTn_bhTVr2U?si=xxxx
    // pathname includes the leading `/` so we have to split that
    videoId = parsedURL.pathname.slice(1);
  } else if (parsedURL.pathname.startsWith('/shorts/')) {
    // example https://youtube.com/shorts/R0KZIPOqITw?si=xxxx
    videoId = parsedURL.pathname.split('/').findLast(Boolean);
  } else if (
    (urlHost === 'youtube.com' || urlHost.endsWith('.youtube.com')) &&
    parsedURL.pathname === '/watch'
  ) {
    // example: https://www.youtube.com/watch?v=MTn_bhTVr2U&list=RDjcB4zu4KX10&index=3
    // get returns null if `v` is not in the url
    videoId = urlSearchParams.get('v') ?? undefined;
  } else return null;

  if (!videoId) return null;

  // playlist is not used for the embed, it can be appended as is
  // returns null if `list` doesn't exist
  const playlist = urlSearchParams.get('list') ?? undefined;
  // returns null if `t` doesn't exist
  const timestamp = urlSearchParams.get('t') ?? urlSearchParams.get('start') ?? undefined;

  return {
    videoId,
    timestamp,
    playlist,
    isMusic: url.includes('music.youtube.com'),
  };
}

export const ClientPreview = as<'div', { url: string }>(({ url, ...props }, ref) => {
  const [showYoutube] = useSetting(settingsAtom, 'clientPreviewYoutube');

  // this component is overly complicated, because it was designed to support more embed types than just youtube
  // i'm leaving this mess here to support later expansion
  const isYoutube = !!youtubeUrl(url);
  const videoInfo = isYoutube ? parseYoutubeLink(url) : null;

  const fetchUrl =
    isYoutube && videoInfo
      ? `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://youtube.com/watch?v=${videoInfo.videoId}`)}`
      : url;

  const [embedStatus, loadEmbed] = useAsyncCallback(
    useCallback(() => oEmbedData(fetchUrl), [fetchUrl])
  );

  useEffect(() => {
    const fetchYoutube = isYoutube && showYoutube;

    if (fetchYoutube) loadEmbed();
  }, [isYoutube, showYoutube, loadEmbed]);

  let previewContent;

  if (videoInfo) {
    if (showYoutube) {
      if (embedStatus.status === AsyncStatus.Error) return null;

      if (embedStatus.status === AsyncStatus.Success && embedStatus.data) {
        previewContent = <YoutubeElement videoInfo={videoInfo} embedData={embedStatus.data} />;
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
