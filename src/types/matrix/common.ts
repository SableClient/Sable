import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { MsgType } from '$types/matrix-sdk';
import { SerializableMap } from '$types/wrapper/SerializableMap';
import { SerializableSet } from '$types/wrapper/SerializableSet';

export const MATRIX_BLUR_HASH_PROPERTY_NAME = 'xyz.amorgan.blurhash';
export const MATRIX_SPOILER_PROPERTY_NAME = 'page.codeberg.everypizza.msc4193.spoiler';
export const MATRIX_SPOILER_REASON_PROPERTY_NAME =
  'page.codeberg.everypizza.msc4193.spoiler.reason';
export const MATRIX_IMAGE_SOURCE_PACK_PROPERTY_NAME = 'com.beeper.msc4459.image_source_packs';

export type IImageInfo = {
  w?: number;
  h?: number;
  mimetype?: string;
  size?: number;
  [MATRIX_BLUR_HASH_PROPERTY_NAME]?: string;
};

export type MatrixRelatesTo = {
  rel_type: 'm.annotation';
  event_id: string;
  key?: string;
};

/**
 * Image Pack Reference
 * as per https://github.com/matrix-org/matrix-spec-proposals/pull/4459
 */
export type MSC4459ImagePackReference = {
  /**
   * Id of the room where the image pack lives
   */
  room_id?: string;
  /**
   * via servers to help join the room,
   * optional
   */
  via?: SerializableSet<string>;
  /**
   * TODO doc
   */
  state_key?: string;
  /**
   * the shortcode this emoji is refered by
   */
  shortcode?: string;
};

export type MSC1767Text = {
  body: string;
  mimetype?: string;
};

export type MatrixReactionEvent = {
  'm.relates_to': MatrixRelatesTo;
  shortcode?: string;
  'com.beeper.reaction.shortcode'?: string;
  /**
   * a map of image pack references
   */
  [MATRIX_IMAGE_SOURCE_PACK_PROPERTY_NAME]?: SerializableMap<string, MSC4459ImagePackReference>;
};

export type IVideoInfo = {
  w?: number;
  h?: number;
  mimetype?: string;
  size?: number;
  duration?: number;
};

export type IAudioInfo = {
  mimetype?: string;
  size?: number;
  duration?: number;
};

export type IFileInfo = {
  mimetype?: string;
  size?: number;
};

export type IEncryptedFile = EncryptedAttachmentInfo & {
  url: string;
};

export type IThumbnailContent = {
  thumbnail_info?: IImageInfo;
  thumbnail_file?: IEncryptedFile;
  thumbnail_url?: string;
};

export type IImageContent = {
  msgtype: MsgType.Image;
  body?: string;
  filename?: string;
  url?: string;
  info?: IImageInfo & IThumbnailContent;
  file?: IEncryptedFile;
  [MATRIX_SPOILER_PROPERTY_NAME]?: boolean;
  [MATRIX_SPOILER_REASON_PROPERTY_NAME]?: string;
};

export type IVideoContent = {
  msgtype: MsgType.Video;
  body?: string;
  filename?: string;
  url?: string;
  info?: IVideoInfo & IThumbnailContent;
  file?: IEncryptedFile;
  [MATRIX_SPOILER_PROPERTY_NAME]?: boolean;
  [MATRIX_SPOILER_REASON_PROPERTY_NAME]?: string;
};

export type IAudioContent = {
  msgtype: MsgType.Audio;
  body?: string;
  filename?: string;
  url?: string;
  info?: IAudioInfo;
  file?: IEncryptedFile;
};

export type IFileContent = {
  msgtype: MsgType.File;
  body?: string;
  filename?: string;
  url?: string;
  info?: IFileInfo & IThumbnailContent;
  file?: IEncryptedFile;
};

export type ILocationContent = {
  msgtype: MsgType.Location;
  body?: string;
  geo_uri?: string;
  info?: IThumbnailContent;
};
