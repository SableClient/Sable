export enum EmojiBoardTab {
  Emoji = 'Emoji',
  Sticker = 'Sticker',
  Gif = 'Gif',
}

export enum EmojiType {
  Emoji = 'emoji',
  CustomEmoji = 'customEmoji',
  Sticker = 'sticker',
  Gif = 'gif',
}

export type EmojiItemInfo = {
  type: EmojiType;
  data: string;
  shortcode: string;
  label: string;
};

export type GifData = {
  id: string;
  title: string;
  url: string;
  preview_url?: string;
  width?: number;
  height?: number;
};
