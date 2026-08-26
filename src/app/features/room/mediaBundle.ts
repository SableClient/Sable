import type { MatrixEvent } from '$types/matrix-sdk';
import { EventType, MsgType } from '$types/matrix-sdk';
import type { ProcessedEvent } from '$hooks/timeline/useProcessedTimeline';
import type { IGalleryContent } from '$types/matrix/common';
import type { RoomMediaItem } from '$components/image-viewer/RoomMediaViewer';

export const isMediaEvent = (mEvent: MatrixEvent): boolean => {
  if (mEvent.isRedacted()) return false;
  const content = mEvent.getContent() as { msgtype?: string };
  return content.msgtype === MsgType.Image || mEvent.getType() === (EventType.Sticker as string);
};

/** The contiguous run of media events forming the attachment bundle around `eventId`,
 *  derived from the rendered timeline's own collapse groups rather than raw event
 *  adjacency (raw arrays interleave non-media rows that break a naive contiguous walk). */
export function getMediaBundleEvents(
  processedEvents: ProcessedEvent[],
  eventId: string
): MatrixEvent[] {
  const clickedIndex = processedEvents.findIndex((row) => row.mEvent.getId() === eventId);
  if (clickedIndex < 0 || !isMediaEvent(processedEvents[clickedIndex]!.mEvent)) return [];

  // A collapse group is an anchor row (collapsed=false) followed by rows whose
  // `collapsed` flag chains them onto it. Walk back to the anchor, then forward
  // through the chain, keeping only the media rows.
  let start = clickedIndex;
  while (start > 0 && processedEvents[start]!.collapsed) start -= 1;

  const bundle: MatrixEvent[] = [];
  for (let i = start; i < processedEvents.length; i += 1) {
    const row = processedEvents[i]!;
    if (i > start && !row.collapsed) break;
    if (isMediaEvent(row.mEvent)) bundle.push(row.mEvent);
  }

  return bundle;
}

/** The navigable media items of a gallery message — one bundle per event, so each
 *  image gets a synthetic id (`<eventId>:<itemIndex>`) instead of a real event id. */
export function getGalleryMediaItems(
  mEvent: MatrixEvent | undefined,
  content: IGalleryContent,
  senderName?: string
): RoomMediaItem[] {
  const eventId = mEvent?.getId();
  if (!eventId || !mEvent || mEvent.isRedacted()) return [];

  return (content.itemtypes ?? []).flatMap((item, index) => {
    if (item.itemtype !== MsgType.Image) return [];
    const url = item.file?.url ?? item.url;
    if (typeof url !== 'string') return [];
    return [
      {
        eventId: `${eventId}:${index}`,
        body: item.body ?? item.filename ?? 'Image',
        filename: item.filename,
        url,
        info: item.info,
        mimeType: item.info?.mimetype,
        encInfo: item.file,
        sender: senderName,
        timestamp: mEvent.getTs(),
      },
    ];
  });
}
