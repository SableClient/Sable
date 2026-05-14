import { atom } from 'jotai';
import * as Sentry from '@sentry/react';
import type { CallEmbed } from '../plugins/call';

const baseCallEmbedAtom = atom<CallEmbed | undefined>(undefined);

// Tracks when the active call embed was created, for lifetime measurement.
let embedCreatedAt: number | null = null;

export const callEmbedAtom = atom<CallEmbed | undefined, [CallEmbed | undefined], void>(
  (get) => get(baseCallEmbedAtom),
  (get, set, callEmbed) => {
    const prevCallEmbed = get(baseCallEmbedAtom);
    if (callEmbed === prevCallEmbed) return;

    if (prevCallEmbed) {
      if (embedCreatedAt !== null) {
        Sentry.metrics.distribution(
          'sable.call.embed_lifetime_ms',
          performance.now() - embedCreatedAt,
          { attributes: { reason: callEmbed === undefined ? 'disposed' : 'replaced' } }
        );
        embedCreatedAt = null;
      }
      prevCallEmbed.dispose();
    }

    if (callEmbed !== undefined) {
      embedCreatedAt = performance.now();
    }

    set(baseCallEmbedAtom, callEmbed);
  }
);

export const callChatAtom = atom(false);

export type IncomingCallNotificationType = 'ring' | 'notification';
export type IncomingCallIntentKind = 'audio' | 'video';

export type IncomingCall = {
  roomId: string;
  notificationEventId: string;
  refEventId: string;
  senderId: string;
  senderTs: number;
  expiresAt: number;
  notificationType: IncomingCallNotificationType;
  intentKind: IncomingCallIntentKind;
  intentRaw?: string;
  isDirect: boolean;
};

export type AutoJoinCallIntent = {
  roomId: string;
  video: boolean;
};

export const incomingCallAtom = atom<IncomingCall | null>(null);
export const incomingCallRoomIdAtom = atom((get) => get(incomingCallAtom)?.roomId ?? null);
export const autoJoinCallIntentAtom = atom<AutoJoinCallIntent | null>(null);
export const mutedCallRoomIdAtom = atom<string | null>(null);
