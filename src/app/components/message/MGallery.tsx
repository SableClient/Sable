import { type ReactNode } from 'react';
import { Box } from 'folds';
import { MsgType, type IContent } from 'matrix-js-sdk';
import type {
  IGalleryContent,
  IGalleryImageItem,
  IGalleryItem,
  IGalleryVideoItem,
} from '$types/matrix/common';
import * as css from './MGallery.css';

function galleryItemToContent(item: IGalleryItem): IContent {
  const { itemtype, ...rest } = item;
  return { ...rest, msgtype: itemtype } as IContent;
}

type MGalleryProps = {
  content: IGalleryContent;
  renderItem: (content: IContent, index: number) => ReactNode;
};

type PartitionedMediaItem = {
  items: (IGalleryImageItem | IGalleryVideoItem)[];
  type: 'ThreeByThree' | 'TwoByTwo' | 'OneByOne' | 'ThreeItems';
};

export function MGallery({ content, renderItem }: MGalleryProps) {
  const items = Array.isArray(content.itemtypes) ? content.itemtypes : [];

  let mediaItems = items.filter(
    (item) => item.itemtype == MsgType.Video || item.itemtype == MsgType.Image
  );
  const columnItems = items.filter(
    (item) => item.itemtype == MsgType.File || item.itemtype == MsgType.Audio
  );

  let partitionedMediaItems: PartitionedMediaItem[] = [];
  while (mediaItems.length > 0) {
    if (mediaItems.length >= 9) {
      partitionedMediaItems.unshift({
        items: mediaItems.slice(-9),
        type: 'ThreeByThree',
      });
      mediaItems = mediaItems.slice(0, mediaItems.length - 9);
      continue;
    }
    if (mediaItems.length >= 6) {
      partitionedMediaItems.unshift({
        items: mediaItems.slice(-6),
        type: 'ThreeByThree',
      });
      mediaItems = mediaItems.slice(0, mediaItems.length - 6);
      continue;
    }
    if (mediaItems.length >= 4) {
      partitionedMediaItems.unshift({
        items: mediaItems.slice(-4),
        type: 'TwoByTwo',
      });
      mediaItems = mediaItems.slice(0, mediaItems.length - 4);
      continue;
    }
    if (mediaItems.length > 3) {
      partitionedMediaItems.unshift({
        items: mediaItems.slice(-3),
        type: 'ThreeByThree',
      });
      mediaItems = mediaItems.slice(0, mediaItems.length - 3);
      continue;
    }
    if (mediaItems.length == 3) {
      partitionedMediaItems.unshift({
        items: mediaItems.slice(-3),
        type: 'ThreeItems',
      });
      mediaItems = mediaItems.slice(0, mediaItems.length - 3);
      continue;
    }
    if (mediaItems.length >= 2) {
      partitionedMediaItems.unshift({
        items: mediaItems.slice(-2),
        type: 'TwoByTwo',
      });
      mediaItems = mediaItems.slice(0, mediaItems.length - 2);
      continue;
    }
    if (mediaItems.length >= 1) {
      partitionedMediaItems.unshift({
        items: mediaItems.slice(-1),
        type: 'OneByOne',
      });
      mediaItems = mediaItems.slice(0, mediaItems.length - 1);
      continue;
    }
  }
  return (
    <Box display="Flex" direction="Column" gap="400">
      {partitionedMediaItems.length > 0 && (
        <Box direction="Column" gap="200">
          {partitionedMediaItems.map((item) => (
            <div
              key={`${item.type}-${item.items[0]?.url ?? item.items[0]?.file?.url}`}
              className={css.GalleryImageGrid({
                type: item.type,
              })}
            >
              {item.items.map((mediaItem, index) => (
                <div key={mediaItem.url ?? mediaItem.file?.url} className={css.GalleryItem()}>
                  {renderItem(galleryItemToContent(mediaItem), index)}
                </div>
              ))}
            </div>
          ))}
        </Box>
      )}
      {columnItems.length > 0 && (
        <Box alignItems="Start" gap="200" direction="Column">
          {columnItems.map((item, index) => (
            <div key={item.url ?? item.file?.url ?? index}>
              {renderItem(galleryItemToContent(item), index)}
            </div>
          ))}
        </Box>
      )}
    </Box>
  );
}
