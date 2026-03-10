import { atom } from 'jotai';
import { CallEmbed } from '../plugins/call';

const baseCallEmbedAtom = atom<CallEmbed | undefined>(undefined);

export const callEmbedAtom = atom<CallEmbed | undefined, [CallEmbed | undefined], void>(
  (get) => get(baseCallEmbedAtom),
  (get, set, callEmbed) => {
    const prevCallEmbed = get(baseCallEmbedAtom);
    if (callEmbed === prevCallEmbed) return;

    if (prevCallEmbed) {
      prevCallEmbed.dispose();
    }

    set(baseCallEmbedAtom, callEmbed);
  }
);

export const callChatAtom = atom<boolean>(false);

export const incomingCallRoomIdAtom = atom<string | null>(null);
export const autoJoinCallIntentAtom = atom<string | null>(null);
export const mutedCallRoomIdAtom = atom<string | null>(null);
