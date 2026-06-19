import type { BookmarkItemContent } from '$features/bookmarks/bookmarkDomain';
import { buildStoredMessagePreview } from '$utils/messagePreview';

const BODY_BACKED_PLACEHOLDER_KINDS = new Set([
  'image',
  'video',
  'audio',
  'file',
  'location',
  'sticker',
]);

export function getStoredBookmarkFallbackText(
  item: Pick<BookmarkItemContent, 'body_preview' | 'msgtype'>
): string {
  const preview = buildStoredMessagePreview({ body: item.body_preview, msgType: item.msgtype });
  const previewText = preview?.placeholderText?.trim();
  const rawBody = item.body_preview?.trim();

  if (preview?.isLinkOnly && typeof preview.body === 'string' && preview.body.trim()) {
    return preview.body;
  }

  if (
    previewText &&
    rawBody &&
    rawBody !== previewText &&
    preview?.kind &&
    BODY_BACKED_PLACEHOLDER_KINDS.has(preview.kind)
  ) {
    return `${previewText} ${rawBody}`;
  }

  if (previewText) return previewText;
  return rawBody ?? '';
}
