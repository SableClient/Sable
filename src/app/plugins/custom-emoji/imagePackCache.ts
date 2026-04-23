/**
 * Persistent localStorage cache for image packs (emoji / stickers).
 *
 * Sliding Sync may not deliver `im.ponies.room_emotes` state events for rooms
 * that aren't actively subscribed, so previously-seen packs would silently
 * disappear on the next session.  This cache persists the serialised pack
 * content keyed by (userId, scope) so the UI can show stale-but-usable packs
 * while the live state catches up.
 *
 * Scopes
 *   'user'           – the user's own im.ponies.user_emotes account-data pack
 *   'global'         – all globally-enabled room packs via im.ponies.emote_rooms
 *   'room:<roomId>'  – packs local to a specific room
 */

import { PackAddress } from './PackAddress';
import { ImagePack } from './ImagePack';
import type { PackContent, PackImages } from './types';

// --------------------------------------------------------------------------
// Types stored in localStorage
// --------------------------------------------------------------------------

type CachedAddress = { roomId: string; stateKey: string };

type CachedPackEntry = {
  id: string;
  content: PackContent;
  address?: CachedAddress;
};

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

const STORAGE_KEY_PREFIX = 'sable:imgpk:v1';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function storageKey(userId: string, scope: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}:${scope}`;
}

/** Reconstruct a plain `PackContent` from a live `ImagePack` instance. */
function toPackContent(pack: ImagePack): PackContent {
  const rawImages: PackImages = {};
  pack.images.collection.forEach((img, shortcode) => {
    rawImages[shortcode] = img.content;
  });
  return {
    pack: pack.meta.content,
    images: rawImages,
  };
}

function deserializePacks(entries: CachedPackEntry[]): ImagePack[] {
  return entries.map(({ id, content, address }) => {
    const addr = address ? new PackAddress(address.roomId, address.stateKey) : undefined;
    return new ImagePack(id, content, addr);
  });
}

function serializePacks(packs: ImagePack[]): CachedPackEntry[] {
  return packs
    .filter((pack) => !pack.deleted)
    .map((pack) => ({
      id: pack.id,
      content: toPackContent(pack),
      address: pack.address
        ? { roomId: pack.address.roomId, stateKey: pack.address.stateKey }
        : undefined,
    }));
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/** Read cached packs for the given scope. Returns an empty array on any error. */
export function readCachedPacks(userId: string, scope: string): ImagePack[] {
  try {
    const raw = localStorage.getItem(storageKey(userId, scope));
    if (!raw) return [];
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) return [];
    return deserializePacks(entries as CachedPackEntry[]);
  } catch {
    return [];
  }
}

/** Read a single cached pack for the given scope. Returns undefined on any error or miss. */
export function readCachedPack(userId: string, scope: string): ImagePack | undefined {
  return readCachedPacks(userId, scope)[0];
}

/** Persist packs for the given scope. Silently ignores storage errors. */
export function writeCachedPacks(userId: string, scope: string, packs: ImagePack[]): void {
  try {
    const entries = serializePacks(packs);
    if (entries.length === 0) {
      localStorage.removeItem(storageKey(userId, scope));
    } else {
      localStorage.setItem(storageKey(userId, scope), JSON.stringify(entries));
    }
  } catch {
    // private browsing / storage quota – silently ignore
  }
}

/** Persist a single pack, or remove the entry when undefined. */
export function writeCachedPack(userId: string, scope: string, pack: ImagePack | undefined): void {
  writeCachedPacks(userId, scope, pack ? [pack] : []);
}

/** Scope string for the user's own pack. */
export const userPackScope = () => 'user';

/** Scope string for the global pack list. */
export const globalPacksScope = () => 'global';

/** Scope string for a specific room's packs. */
export const roomPacksScope = (roomId: string) => `room:${roomId}`;
