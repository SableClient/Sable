type Importer = () => Promise<unknown>;

const prefetchCache = new Map<string, Promise<void>>();

export const prefetchRouteChunks = (key: string, importers: Importer[]): Promise<void> => {
  const cached = prefetchCache.get(key);
  if (cached) return cached;

  const task = Promise.all(importers.map((importer) => importer()))
    .then(() => undefined)
    .catch(() => undefined);
  prefetchCache.set(key, task);
  return task;
};

export const prefetchExploreRoute = (): Promise<void> =>
  prefetchRouteChunks('explore', [
    () => import('./client/explore/Explore'),
    () => import('./client/explore/Featured'),
    () => import('./client/explore/Server'),
  ]);

export const prefetchInboxRoute = (): Promise<void> =>
  prefetchRouteChunks('inbox', [
    () => import('./client/inbox/Inbox'),
    () => import('./client/inbox/Notifications'),
    () => import('./client/inbox/Invites'),
  ]);

export const prefetchSettingsRoute = (): Promise<void> =>
  prefetchRouteChunks('settings', [() => import('$features/settings/SettingsRoute')]);

export const prefetchCreateRoute = (): Promise<void> =>
  prefetchRouteChunks('create', [() => import('./client/create/Create')]);

export const prefetchSpaceLobbyRoute = (): Promise<void> =>
  prefetchRouteChunks('space-lobby', [() => import('$features/lobby/Lobby')]);

export const prefetchSearchModal = (): Promise<void> =>
  prefetchRouteChunks('search-modal', [() => import('$features/search/Search')]);

export const prefetchUserProfileModal = (): Promise<void> =>
  prefetchRouteChunks('user-profile-modal', [() => import('$components/user-profile')]);

export const prefetchRoomSettingsModal = (): Promise<void> =>
  prefetchRouteChunks('room-settings-modal', [
    () => import('$features/room-settings/RoomSettings'),
  ]);

export const prefetchSpaceSettingsModal = (): Promise<void> =>
  prefetchRouteChunks('space-settings-modal', [
    () => import('$features/space-settings/SpaceSettings'),
  ]);

type IdleDeadline = { didTimeout: boolean; timeRemaining: () => number };
type IdleRequestCallback = (deadline: IdleDeadline) => void;
type IdleRequestWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };

let initialPrefetchScheduled = false;

export const runInitialRoutePrefetch = (): void => {
  void prefetchExploreRoute();
  void prefetchInboxRoute();
  void prefetchSpaceLobbyRoute();
  void prefetchSettingsRoute();
  void prefetchCreateRoute();
  void prefetchSearchModal();
};

export const scheduleInitialRoutePrefetch = (
  runPrefetch: () => void = runInitialRoutePrefetch,
  winOverride?: IdleRequestWindow
): void => {
  if (initialPrefetchScheduled) return;
  initialPrefetchScheduled = true;

  const win = winOverride ?? (window as IdleRequestWindow);
  if (typeof win.requestIdleCallback === 'function') {
    win.requestIdleCallback(() => runPrefetch(), { timeout: 1200 });
    return;
  }

  win.setTimeout(runPrefetch, 0);
};

export const __resetRoutePrefetchForTests = (): void => {
  prefetchCache.clear();
  initialPrefetchScheduled = false;
};
