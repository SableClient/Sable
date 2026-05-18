/**
 * Tracks recently visited rooms for prefetching optimization.
 * Stores up to 10 most recent room IDs per user in localStorage.
 */

const RECENT_ROOMS_KEY = 'sable-recent-rooms';
const MAX_RECENT_ROOMS = 10;

type RecentRoomsStore = Record<string, string[]>;

/**
 * Get list of recently visited rooms for a user.
 * Returns empty array if none found.
 */
export function getRecentRoomIds(userId: string): string[] {
  try {
    const stored = localStorage.getItem(RECENT_ROOMS_KEY);
    if (!stored) return [];

    const data: RecentRoomsStore = JSON.parse(stored);
    return data[userId] ?? [];
  } catch {
    return [];
  }
}

/**
 * Add a room to the recent list for a user.
 * Moves room to front if already present.
 * Trims list to MAX_RECENT_ROOMS.
 */
export function addRecentRoom(userId: string, roomId: string): void {
  try {
    const stored = localStorage.getItem(RECENT_ROOMS_KEY);
    const data: RecentRoomsStore = stored ? JSON.parse(stored) : {};

    let userRooms = data[userId] ?? [];

    // Remove if already present
    userRooms = userRooms.filter((id) => id !== roomId);

    // Add to front
    userRooms.unshift(roomId);

    // Trim to max
    if (userRooms.length > MAX_RECENT_ROOMS) {
      userRooms = userRooms.slice(0, MAX_RECENT_ROOMS);
    }

    data[userId] = userRooms;
    localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(data));
  } catch {
    // localStorage quota exceeded or unavailable — silent ignore
  }
}

/**
 * Clear recent rooms for a user (e.g., on logout).
 */
export function clearRecentRooms(userId: string): void {
  try {
    const stored = localStorage.getItem(RECENT_ROOMS_KEY);
    if (!stored) return;

    const data: RecentRoomsStore = JSON.parse(stored);
    delete data[userId];

    if (Object.keys(data).length === 0) {
      localStorage.removeItem(RECENT_ROOMS_KEY);
    } else {
      localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(data));
    }
  } catch {
    // Silent ignore
  }
}
