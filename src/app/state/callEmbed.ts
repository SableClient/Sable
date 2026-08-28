import { atom } from 'jotai';
import * as Sentry from '@sentry/react';
import type { CallEmbed } from '../plugins/call';
import type { CallEmbedStartError } from '$plugins/call/callEmbedError';
import { releaseCallOwner } from './callOwner';

const baseCallEmbedAtom = atom<CallEmbed | undefined>(undefined);
const baseCallEmbedStartErrorAtom = atom<CallEmbedStartError | null>(null);

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
      releaseCallOwner('element', prevCallEmbed.roomId);
    }

    if (callEmbed !== undefined) {
      embedCreatedAt = performance.now();
    }

    if (callEmbed === undefined) {
      set(baseCallEmbedStartErrorAtom, null);
    }

    set(baseCallEmbedAtom, callEmbed);
  }
);

export const callEmbedStartErrorAtom = atom<
  CallEmbedStartError | null,
  [CallEmbedStartError | null],
  void
>(
  (get) => get(baseCallEmbedStartErrorAtom),
  (_get, set, nextError) => {
    set(baseCallEmbedStartErrorAtom, nextError);
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

type AutoJoinCallIntent = {
  roomId: string;
  video: boolean;
};

export const incomingCallAtom = atom<IncomingCall | null>(null);
export const autoJoinCallIntentAtom = atom<AutoJoinCallIntent | null>(null);
export const mutedCallRoomIdAtom = atom<string | null>(null);
export const callSoundBlockedAtom = atom(false);
