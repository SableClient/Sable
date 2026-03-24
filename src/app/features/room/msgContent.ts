import { IContent, MatrixClient, MsgType } from '$types/matrix-sdk';
import to from 'await-to-js';
import {
  IThumbnailContent,
  MATRIX_BLUR_HASH_PROPERTY_NAME,
  MATRIX_SPOILER_PROPERTY_NAME,
} from '$types/matrix/common';
import {
  getImageFileUrl,
  getThumbnail,
  getThumbnailDimensions,
  getVideoFileUrl,
  loadImageElement,
  loadVideoElement,
} from '$utils/dom';
import { encryptFile, getImageInfo, getThumbnailContent, getVideoInfo } from '$utils/matrix';
import { TUploadItem } from '$state/room/roomInputDrafts';
import { encodeBlurHash } from '$utils/blurHash';
import { scaleYDimension } from '$utils/common';
import { createLogger } from '$utils/debug';

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
    [MATRIX_SPOILER_PROPERTY_NAME]: metadata.markedAsSpoiler,
  };
  if (imgEl) {
    const blurHash = encodeBlurHash(imgEl, 512, scaleYDimension(imgEl.width, 512, imgEl.height));

    content.info = {
      ...getImageInfo(imgEl, file),
      [MATRIX_BLUR_HASH_PROPERTY_NAME]: blurHash,
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
    [MATRIX_SPOILER_PROPERTY_NAME]: metadata.markedAsSpoiler,
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
      thumbContent.thumbnail_info[MATRIX_BLUR_HASH_PROPERTY_NAME] = encodeBlurHash(
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
  let content: IContent = {
    msgtype: MsgType.Audio,
    filename: file.name,
    body: item.body && item.body.length > 0 ? item.body : 'a voice message',
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
    'org.matrix.msc1767.text': item.body && item.body.length > 0 ? item.body : 'a voice message',
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
