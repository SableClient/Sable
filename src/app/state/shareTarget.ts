import { atom } from 'jotai';
import type { ShareBatch } from '$generated/tauri/types';

type PendingShare = {
  batches: ShareBatch[];
};

export const pendingShareAtom = atom<PendingShare | null>(null);
