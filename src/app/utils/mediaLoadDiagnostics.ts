import * as Sentry from '@sentry/react';
import { createDebugLogger } from './debugLogger';

export type MediaLoadKind = 'room_banner' | 'room_card_banner' | 'room_banner_preview';

const debugLog = createDebugLogger('media');
const failureCounts = new Map<MediaLoadKind, number>();

export const reportMediaLoadFailure = (kind: MediaLoadKind): void => {
  failureCounts.set(kind, (failureCounts.get(kind) ?? 0) + 1);
  debugLog.warn('network', 'Media failed to load', { kind });
  Sentry.metrics.count('sable.media.load_error', 1, { attributes: { kind } });
};

export const getMediaLoadFailureCounts = (): ReadonlyMap<MediaLoadKind, number> =>
  new Map(failureCounts);
