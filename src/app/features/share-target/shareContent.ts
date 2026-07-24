import type { ShareBatch } from '$generated/tauri/types';

export type ShareFileRef = {
  batchId: string;
  fileName: string;
  mime?: string | null;
};

export const isShareDeepLink = (url: string): boolean => url.startsWith('sable://share');

export const mergeShareBatches = (prev: ShareBatch[], next: ShareBatch[]): ShareBatch[] => {
  const known = new Set(prev.map((batch) => batch.batchId));
  return [...prev, ...next.filter((batch) => !known.has(batch.batchId))];
};

export const collectShareText = (batches: ShareBatch[]): string =>
  batches
    .flatMap((batch) => batch.items)
    .filter((item) => (item.kind === 'text' || item.kind === 'url') && item.text)
    .map((item) => item.text as string)
    .join('\n');

export const collectShareFiles = (batches: ShareBatch[]): ShareFileRef[] =>
  batches.flatMap((batch) =>
    batch.items
      .filter((item) => item.kind === 'file' && item.fileName)
      .map((item) => ({
        batchId: batch.batchId,
        fileName: item.fileName as string,
        mime: item.mime,
      }))
  );

// Strips the collision-avoidance index prefix added at staging time.
export const displayFileName = (stagedName: string): string => stagedName.replace(/^\d+-/, '');
