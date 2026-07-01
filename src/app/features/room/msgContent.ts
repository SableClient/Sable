import type { IContent, MatrixClient } from '$types/matrix-sdk';
import { MsgType } from '$types/matrix-sdk';
import to from 'await-to-js';
import type { IGalleryItem } from '$types/matrix/common';
import { GALLERY_MSGTYPE, type IThumbnailContent } from '$types/matrix/common';
import {
  getImageFileUrl,
  getThumbnail,
  getThumbnailDimensions,
  getVideoFileUrl,
  loadImageElement,
  loadVideoElement,
} from '$utils/dom';
import {
  encryptFile,
  getImageInfo,
  getThumbnailContent,
  getVideoInfo,
  mxcUrlToHttp,
} from '$utils/matrix';
import type { TUploadItem } from '$state/room/roomInputDrafts';
import type { GifData } from '$components/emoji-board/types';
import { encodeBlurHash } from '$utils/blurHash';
import { scaleYDimension } from '$utils/common';
import { createLogger } from '$utils/debug';
import {
  MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME,
  MATRIX_UNSTABLE_SPOILER_PROPERTY_NAME,
} from '../../../unstable/prefixes';

const log = createLogger('msgContent');

const generateThumbnailContent = async (
  mx: MatrixClient,
  img: HTMLImageElement | HTMLVideoElement,
  dimensions: [number, number],
  encrypt: boolean
): Promise<IThumbnailContent> => {
  const thumbnail = await getThumbnail(img, ...dimensions);
  if (!thumbnail) throw new Error('Can not create thumbnail!');
  const encThumbData = encrypt ? await encryptFile(thumbnail) : undefined;
  const thumbnailFile = encThumbData?.file ?? thumbnail;
  if (!thumbnailFile) throw new Error('Can not create thumbnail!');

  const data = await mx.uploadContent(thumbnailFile);
  const thumbMxc = data?.content_uri;
  if (!thumbMxc) throw new Error('Failed when uploading thumbnail!');
  const thumbnailContent = getThumbnailContent({
    thumbnail: thumbnailFile,
    encInfo: encThumbData?.encInfo,
    mxc: thumbMxc,
    width: dimensions[0],
    height: dimensions[1],
  });
  return thumbnailContent;
};

export const getImageMsgContent = async (
  mx: MatrixClient,
  item: TUploadItem,
  mxc: string
): Promise<IContent> => {
  const { file, originalFile, encInfo, metadata } = item;
  const [imgError, imgEl] = await to(loadImageElement(getImageFileUrl(originalFile)));
  if (imgError) log.warn('Failed to load image element:', imgError);

  const content: IContent = {
    msgtype: MsgType.Image,
    filename: file.name,
    body: file.name,
    [MATRIX_UNSTABLE_SPOILER_PROPERTY_NAME]: metadata.markedAsSpoiler,
  };
  if (imgEl) {
    const blurHash = encodeBlurHash(imgEl, 512, scaleYDimension(imgEl.width, 512, imgEl.height));

    content.info = {
      ...getImageInfo(imgEl, file),
      [MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME]: blurHash,
    };
  }
  if (encInfo) {
    content.file = {
      ...encInfo,
      url: mxc,
    };
  } else {
    content.url = mxc;
  }
  if (item.body && item.body.length > 0) content.body = item.body;
  if (item.formatted_body && item.formatted_body.length > 0) {
    content.format = 'org.matrix.custom.html';
    content.formatted_body = item.formatted_body;
  }
  return content;
};

export const getVideoMsgContent = async (
  mx: MatrixClient,
  item: TUploadItem,
  mxc: string
): Promise<IContent> => {
  const { file, originalFile, encInfo, metadata } = item;

  const [videoError, videoEl] = await to(loadVideoElement(getVideoFileUrl(originalFile)));
  if (videoError) log.warn('Failed to load video element:', videoError);

  const content: IContent = {
    msgtype: MsgType.Video,
    filename: file.name,
    body: file.name,
    [MATRIX_UNSTABLE_SPOILER_PROPERTY_NAME]: metadata.markedAsSpoiler,
  };
  if (videoEl) {
    const [thumbError, thumbContent] = await to(
      generateThumbnailContent(
        mx,
        videoEl,
        getThumbnailDimensions(videoEl.videoWidth, videoEl.videoHeight),
        !!encInfo
      )
    );
    if (thumbContent && thumbContent.thumbnail_info) {
      thumbContent.thumbnail_info[MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME] = encodeBlurHash(
        videoEl,
        512,
        scaleYDimension(videoEl.videoWidth, 512, videoEl.videoHeight)
      );
    }
    if (thumbError) log.warn('Failed to generate video thumbnail:', thumbError);
    content.info = {
      ...getVideoInfo(videoEl, file),
      ...thumbContent,
    };
  }
  if (encInfo) {
    content.file = {
      ...encInfo,
      url: mxc,
    };
  } else {
    content.url = mxc;
  }
  if (item.body && item.body.length > 0) content.body = item.body;
  if (item.formatted_body && item.formatted_body.length > 0) {
    content.format = 'org.matrix.custom.html';
    content.formatted_body = item.formatted_body;
  }
  return content;
};

export type AudioMsgContent = IContent & {
  waveform?: number[];
  audioLength?: number;
};

export const getAudioMsgContent = (item: TUploadItem, mxc: string): AudioMsgContent => {
  const { file, encInfo, metadata } = item;
  const { waveform, audioDuration, markedAsSpoiler } = metadata;
  const isVoice = waveform !== undefined && waveform.length > 0;
  const fallbackBody = isVoice ? 'a voice message' : file.name;
  let content: IContent = {
    msgtype: MsgType.Audio,
    filename: file.name,
    body: item.body && item.body.length > 0 ? item.body : fallbackBody,
    info: {
      mimetype: file.type,
      size: file.size,
      duration: markedAsSpoiler || !audioDuration ? 0 : audioDuration * 1000,
    },

    // Element-compatible unstable extensible-event keys
    'org.matrix.msc1767.audio': {
      waveform: waveform?.map((v) => Math.round(v * 1024)),
      duration: markedAsSpoiler || !audioDuration ? 0 : audioDuration * 1000,
    },
    'org.matrix.msc1767.text': item.body && item.body.length > 0 ? item.body : fallbackBody,
    'org.matrix.msc3245.voice.v2': {
      duration: markedAsSpoiler || !audioDuration ? 0 : audioDuration,
      waveform: waveform?.map((v) => Math.round(v * 1024)),
    },
    // for element compat
    'org.matrix.msc3245.voice': {},
  };
  if (encInfo) {
    content.file = {
      ...encInfo,
      url: mxc,
    };
    content = {
      ...content,

      // Element-compatible unstable extensible-event keys
      'org.matrix.msc1767.file': {
        name: file.name,
        mimetype: file.type,
        size: file.size,
        file: content.file,
      },
    };
  } else {
    content.url = mxc;
    content = {
      ...content,

      // Element-compatible unstable extensible-event keys
      'org.matrix.msc1767.file': {
        name: file.name,
        mimetype: file.type,
        size: file.size,
        url: content.url,
      },
    };
  }
  if (item.body && item.body.length > 0) content.body = item.body;
  if (item.formatted_body && item.formatted_body.length > 0) {
    content.format = 'org.matrix.custom.html';
    content.formatted_body = item.formatted_body;
  }
  return content;
};

export const getFileMsgContent = (item: TUploadItem, mxc: string): IContent => {
  const { file, encInfo } = item;
  const content: IContent = {
    msgtype: MsgType.File,
    filename: file.name,
    body: file.name,
    info: {
      mimetype: file.type,
      size: file.size,
    },
  };
  if (encInfo) {
    content.file = {
      ...encInfo,
      url: mxc,
    };
  } else {
    content.url = mxc;
  }
  if (item.body && item.body.length > 0) content.body = item.body;
  if (item.formatted_body && item.formatted_body.length > 0) {
    content.format = 'org.matrix.custom.html';
    content.formatted_body = item.formatted_body;
  }
  return content;
};

export const getGifMsgContent = async (
  mx: MatrixClient,
  gif: GifData,
  mxcUrl: string,
  spoiler?: boolean
): Promise<IContent> => {
  const proxyUrl = mxcUrlToHttp(mx, mxcUrl, true);
  const [imgError, imgEl] = await to(loadImageElement(proxyUrl ?? gif.url, 'anonymous'));
  if (imgError) {
    log.warn(
      'Failed to load image element anonymously for blurhash, falling back to basic metadata:',
      imgError
    );
  }

  const content: IContent = {
    msgtype: MsgType.Image,
    body: gif.title,
    url: mxcUrl,
    info: {
      w: gif.width,
      h: gif.height,
      mimetype: 'image/gif',
    },
  };

  if (gif.size) {
    content.info.size = gif.size;
  }

  if (spoiler) {
    content[MATRIX_UNSTABLE_SPOILER_PROPERTY_NAME] = true;
  }

  if (imgEl) {
    const blurHash = encodeBlurHash(imgEl, 512, scaleYDimension(imgEl.width, 512, imgEl.height));
    if (blurHash) {
      content.info[MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME] = blurHash;
    }
  }

  return content;
};

const swapMsgTypeToItemType = (
  content: IContent,
  itemtype: IGalleryItem['itemtype']
): IGalleryItem => {
  const result = { ...content, itemtype };
  delete result.msgtype;
  return result as IGalleryItem;
};

export const getGalleryItemContent = async (
  mx: MatrixClient,
  item: TUploadItem,
  mxc: string
): Promise<IGalleryItem> => {
  if (item.file.type.startsWith('image')) {
    return swapMsgTypeToItemType(await getImageMsgContent(mx, item, mxc), MsgType.Image);
  }
  if (item.file.type.startsWith('video')) {
    return swapMsgTypeToItemType(await getVideoMsgContent(mx, item, mxc), MsgType.Video);
  }
  if (item.file.type.startsWith('audio')) {
    return swapMsgTypeToItemType(getAudioMsgContent(item, mxc), MsgType.Audio);
  }
  return swapMsgTypeToItemType(getFileMsgContent(item, mxc), MsgType.File);
};

export const buildGalleryContent = (
  items: IGalleryItem[],
  caption?: string,
  formattedCaption?: string
): IContent => {
  const body =
    caption ||
    items.map((item) => `[${item.filename ?? item.itemtype}: ${item.url ?? 'file'}]`).join('\n');

  const content: IContent = {
    msgtype: GALLERY_MSGTYPE,
    body,
    itemtypes: items,
  };

  if (formattedCaption) {
    content.format = 'org.matrix.custom.html';
    content.formatted_body = formattedCaption;
  }

  return content;
};
