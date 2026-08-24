import { lazy, Suspense } from 'react';
import {
  Outlet,
  Route,
  createBrowserRouter,
  createHashRouter,
  createRoutesFromElements,
  redirect,
} from 'react-router';
import * as Sentry from '@sentry/react';

import type { ClientConfig } from '$hooks/useClientConfig';
import { ErrorPage } from '$components/DefaultErrorPage';
import { Lobby } from '$features/lobby';
import { PageRoot } from '$components/page';
import { ScreenSize } from '$hooks/useScreenSize';
import { ReceiveSelfDeviceVerification } from '$components/DeviceVerification';
import { AutoRestoreBackupOnVerification } from '$components/BackupRestore';
import { UserRoomProfileRenderer } from '$components/UserRoomProfileRenderer';
import type { Sessions } from '$state/sessions';
import { getFallbackSession, MATRIX_SESSIONS_KEY } from '$state/sessions';
import { getLocalStorageItem } from '$state/utils/atomWithLocalStorage';
import { NotificationJumper } from '$hooks/useNotificationJumper';
import { GlobalKeyboardShortcuts } from '$components/GlobalKeyboardShortcuts';
import { DesktopShortcuts } from '$components/tauri/DesktopShortcuts';
import { CallEmbedProvider } from '$components/CallEmbedProvider';
import { SplashScreen } from '$components/splash-screen';
import {
  DIRECT_PATH,
  EXPLORE_PATH,
  HOME_PATH,
  LEGACY_LOGIN_PATH,
  LEGACY_REGISTER_PATH,
  LEGACY_RESET_PASSWORD_PATH,
  LOGIN_PATH,
  INBOX_PATH,
  REGISTER_PATH,
  RESET_PASSWORD_PATH,
  SPACE_PATH,
  CREATE_PATH_SEGMENT,
  FEATURED_PATH_SEGMENT,
  INVITES_PATH_SEGMENT,
  JOIN_PATH_SEGMENT,
  LOBBY_PATH_SEGMENT,
  NOTIFICATIONS_PATH_SEGMENT,
  ROOM_PATH_SEGMENT,
  ROOM_FORUM_PATH_SEGMENT,
  SEARCH_PATH_SEGMENT,
  SERVER_PATH_SEGMENT,
  CREATE_PATH,
  TO_ROOM_EVENT_PATH,
  SETTINGS_PATH,
  NAVIGATE_PATH,
  PROFILE_PATH,
  CREATE_ROOM_PATH,
  BUG_REPORT_PATH,
  BOOKMARKS_PATH_SEGMENT,
} from './paths';
import {
  getAppPathFromHref,
  getCreateRoomPath,
  getExploreFeaturedPath,
  getHomePath,
  getInboxNotificationsPath,
  getLoginPath,
  getOriginBaseUrl,
  getSpaceLobbyPath,
} from './pathUtils';
import { ClientBindAtoms, ClientLayout, ClientRoot, ClientRouteOutlet } from './client';
import { ShallowRouteRenderer } from './client/ShallowRouteRenderer';
import { HandleNotificationClick, ClientNonUIFeatures } from './client/ClientNonUIFeatures';
import { RoomRoute } from './client/RoomRoute';
import { Home, HomeRouteRoomProvider, HomeSearch } from './client/home';
import { Direct, DirectCreate, DirectRouteRoomProvider } from './client/direct';
import { RouteSpaceProvider, Space, SpaceRouteRoomProvider, SpaceSearch } from './client/space';
// Lazy-loaded: auth subtree, settings, inbox/bookmarks, explore
const AuthLayout = lazy(() => import('./auth').then((m) => ({ default: m.AuthLayout })));
const Login = lazy(() => import('./auth').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('./auth').then((m) => ({ default: m.Register })));
const ResetPassword = lazy(() => import('./auth').then((m) => ({ default: m.ResetPassword })));

const SettingsRoute = lazy(() =>
  import('$features/settings').then((m) => ({ default: m.SettingsRoute }))
);
const SettingsShallowRouteRenderer = lazy(() =>
  import('$features/settings/SettingsShallowRouteRenderer').then((m) => ({
    default: m.SettingsShallowRouteRenderer,
  }))
);
const RoomSettingsRenderer = lazy(() =>
  import('$features/room-settings').then((m) => ({ default: m.RoomSettingsRenderer }))
);

const Notifications = lazy(() =>
  import('./client/inbox').then((m) => ({ default: m.Notifications }))
);
const Inbox = lazy(() => import('./client/inbox').then((m) => ({ default: m.Inbox })));
const Invites = lazy(() => import('./client/inbox').then((m) => ({ default: m.Invites })));
const Bookmarks = lazy(() => import('./client/inbox').then((m) => ({ default: m.Bookmarks })));

const Explore = lazy(() => import('./client/explore').then((m) => ({ default: m.Explore })));
const FeaturedRooms = lazy(() =>
  import('./client/explore').then((m) => ({ default: m.FeaturedRooms }))
);
const PublicRooms = lazy(() =>
  import('./client/explore').then((m) => ({ default: m.PublicRooms }))
);
import { setAfterLoginRedirectPath } from './afterLoginRedirectPath';
import { legacyAuthLoader } from './legacyAuthRedirect';
import { ensureTauriHistoryRoot } from './tauriHistoryRoot';
import { WelcomePage } from './client/WelcomePage';
import { SidebarNav } from './client/SidebarNav';
import { MobileFriendlySidebarNav, MobileFriendlyBottomNav } from './MobileFriendly';
import { ClientInitStorageAtom } from './client/ClientInitStorageAtom';
import { AuthRouteThemeManager, UnAuthRouteThemeManager } from './ThemeManager';
import { TauriDeepLinkBridge } from './TauriDeepLinkBridge';
import { ClientRoomsNotificationPreferences } from './client/ClientRoomsNotificationPreferences';
import { Create } from './client/create';
import { ToRoomEvent } from './client/ToRoomEvent';
import { CallStatusRenderer } from './CallStatusRenderer';
import { LivekitJsCallAudio } from '$features/call/LivekitJsCallAudio';
import { UserQuickToolsProvider } from '$components/UserQuickToolsProvider';
import { Navigate } from './client/navigate';
import { ProfileMobile } from './client/profile';

// Lazy-loaded: mobile full-screen pages for flows that are modals on desktop.
const CreateRoomPage = lazy(() =>
  import('./client/create-room').then((m) => ({ default: m.CreateRoomPage }))
);
const BugReportPage = lazy(() =>
  import('./client/bug-report').then((m) => ({ default: m.BugReportPage }))
);

/**
 * Returns true if there is at least one stored session.
 * Reads localStorage directly — safe to call outside React (in route loaders).
 */
const hasStoredSession = (): boolean => {
  const sessions = getLocalStorageItem<Sessions>(MATRIX_SESSIONS_KEY, []);
  if (sessions.length > 0) return true;
  return !!getFallbackSession();
};

/** Returns the first available session for the SW push. */
const getFirstSession = () => {
  const sessions = getLocalStorageItem<Sessions>(MATRIX_SESSIONS_KEY, []);
  if (sessions.length > 0) return sessions[0];
  return getFallbackSession();
};

export const createRouter = (clientConfig: ClientConfig, screenSize: ScreenSize) => {
  const { hashRouter } = clientConfig;
  const mobile = screenSize === ScreenSize.Mobile;

  // Before the router reads the initial location, give webview-level back
  // navigation somewhere to land on a fresh deep-linked load.
  ensureTauriHistoryRoot(hashRouter);

  const routes = createRoutesFromElements(
    <Route
      HydrateFallback={() => <SplashScreen>{null}</SplashScreen>}
      element={
        <>
          <TauriDeepLinkBridge />
          <Outlet />
        </>
      }
    >
      <Route
        index
        loader={() => {
          if (hasStoredSession()) return redirect(getHomePath());
          const afterLoginPath = getAppPathFromHref(getOriginBaseUrl(), window.location.href);
          if (afterLoginPath) setAfterLoginRedirectPath(afterLoginPath);
          return redirect(getLoginPath());
        }}
      />
      <Route
        loader={({ request }) => {
          // Allow reaching the login page even when already logged in:
          // - ?addAccount=1 to add another account (multi-account)
          // - ?loginToken=... (delegated / SSO login token)
          // - ?code=...&state=... (OIDC authorization-code callback, e.g. adding a second account)
          const url = new URL(request.url);
          if (url.searchParams.get('addAccount') === '1') return null;
          if (url.searchParams.has('loginToken')) return null;
          if (url.searchParams.has('code') && url.searchParams.has('state')) return null;
          if (url.searchParams.has('error') && url.searchParams.has('state')) return null;
          if (hasStoredSession()) return redirect(getHomePath());
          return null;
        }}
        element={
          <Sentry.ErrorBoundary
            fallback={({ error, eventId }) => (
              <ErrorPage
                error={error instanceof Error ? error : new Error(String(error))}
                eventId={eventId || undefined}
              />
            )}
            beforeCapture={(scope) => scope.setTag('section', 'auth')}
          >
            <Suspense fallback={<SplashScreen>{null}</SplashScreen>}>
              <>
                <AuthLayout />
                <UnAuthRouteThemeManager />
              </>
            </Suspense>
          </Sentry.ErrorBoundary>
        }
      >
        <Route path={LOGIN_PATH} element={<Login />} />
        <Route path={REGISTER_PATH} element={<Register />} />
        <Route path={RESET_PASSWORD_PATH} element={<ResetPassword />} />
      </Route>

      <Route path={LEGACY_LOGIN_PATH} loader={legacyAuthLoader(LOGIN_PATH)} />
      <Route path={LEGACY_REGISTER_PATH} loader={legacyAuthLoader(REGISTER_PATH)} />
      <Route path={LEGACY_RESET_PASSWORD_PATH} loader={legacyAuthLoader(RESET_PASSWORD_PATH)} />

      <Route
        loader={() => {
          const session = getFirstSession();
          if (!session) {
            const afterLoginPath = getAppPathFromHref(
              getOriginBaseUrl(hashRouter),
              window.location.href
            );
            if (afterLoginPath) setAfterLoginRedirectPath(afterLoginPath);
            return redirect(getLoginPath());
          }
          return null;
        }}
        element={
          <Sentry.ErrorBoundary
            fallback={({ error, eventId }) => (
              <ErrorPage
                error={error instanceof Error ? error : new Error(String(error))}
                eventId={eventId || undefined}
              />
            )}
            beforeCapture={(scope) => scope.setTag('section', 'client')}
          >
            <AuthRouteThemeManager>
              {/* HandleNotificationClick must live outside ClientRoot's loading gate so
                SW notification-click postMessages are never dropped during client
                reloads (e.g., account switches). It only needs navigate + Jotai atoms. */}
              <HandleNotificationClick />
              <ClientRoot>
                <ClientInitStorageAtom>
                  <ClientRoomsNotificationPreferences>
                    <ClientBindAtoms>
                      <ClientNonUIFeatures>
                        <NotificationJumper />
                        <CallEmbedProvider>
                          <ClientLayout
                            nav={
                              <MobileFriendlySidebarNav>
                                <SidebarNav />
                              </MobileFriendlySidebarNav>
                            }
                          >
                            <ClientRouteOutlet />
                          </ClientLayout>
                          <CallStatusRenderer />
                          <LivekitJsCallAudio />
                        </CallEmbedProvider>
                        <MobileFriendlyBottomNav>
                          <UserQuickToolsProvider />
                        </MobileFriendlyBottomNav>
                        <UserRoomProfileRenderer />
                        <ShallowRouteRenderer />
                        <Suspense fallback={null}>
                          <SettingsShallowRouteRenderer />
                        </Suspense>
                        <Suspense fallback={null}>
                          <RoomSettingsRenderer />
                        </Suspense>
                        <GlobalKeyboardShortcuts />
                        <DesktopShortcuts />
                        {/* Screen reader live region — populated by announce() in utils/announce.ts */}
                        <div
                          id="sable-announcements"
                          role="status"
                          aria-live="polite"
                          aria-atomic="true"
                          style={{
                            position: 'absolute',
                            width: '1px',
                            height: '1px',
                            overflow: 'hidden',
                            clip: 'rect(0,0,0,0)',
                            whiteSpace: 'nowrap',
                          }}
                        />
                        <ReceiveSelfDeviceVerification />
                        <AutoRestoreBackupOnVerification />
                      </ClientNonUIFeatures>
                    </ClientBindAtoms>
                  </ClientRoomsNotificationPreferences>
                </ClientInitStorageAtom>
              </ClientRoot>
            </AuthRouteThemeManager>
          </Sentry.ErrorBoundary>
        }
      >
        <Route
          path={HOME_PATH}
          element={
            <PageRoot rail={<SidebarNav />} bottomNav={<UserQuickToolsProvider />} nav={<Home />}>
              <Outlet />
            </PageRoot>
          }
        >
          {mobile ? null : <Route index element={<WelcomePage />} />}
          {/* Superseded by CREATE_ROOM_PATH; kept so old links keep working. */}
          <Route path={CREATE_PATH_SEGMENT} loader={() => redirect(getCreateRoomPath())} />
          <Route path={JOIN_PATH_SEGMENT} element={<p>join</p>} />
          <Route path={SEARCH_PATH_SEGMENT} element={<HomeSearch />} />
          <Route
            path={ROOM_PATH_SEGMENT}
            element={
              <HomeRouteRoomProvider>
                <RoomRoute section="home" forum={false} />
              </HomeRouteRoomProvider>
            }
          />
          <Route
            path={ROOM_FORUM_PATH_SEGMENT}
            element={
              <HomeRouteRoomProvider>
                <RoomRoute section="home" forum />
              </HomeRouteRoomProvider>
            }
          />
        </Route>
        <Route
          path={DIRECT_PATH}
          element={
            <PageRoot rail={<SidebarNav />} bottomNav={<UserQuickToolsProvider />} nav={<Direct />}>
              <Outlet />
            </PageRoot>
          }
        >
          {mobile ? null : <Route index element={<WelcomePage />} />}
          <Route path={CREATE_PATH_SEGMENT} element={<DirectCreate />} />
          <Route
            path={ROOM_PATH_SEGMENT}
            element={
              <DirectRouteRoomProvider>
                <RoomRoute section="direct" forum={false} />
              </DirectRouteRoomProvider>
            }
          />
          <Route
            path={ROOM_FORUM_PATH_SEGMENT}
            element={
              <DirectRouteRoomProvider>
                <RoomRoute section="direct" forum />
              </DirectRouteRoomProvider>
            }
          />
        </Route>
        <Route
          path={SPACE_PATH}
          element={
            <RouteSpaceProvider>
              <PageRoot
                rail={<SidebarNav />}
                bottomNav={<UserQuickToolsProvider />}
                nav={<Space />}
              >
                <Outlet />
              </PageRoot>
            </RouteSpaceProvider>
          }
        >
          {mobile ? null : (
            <Route
              index
              loader={({ params }) => {
                const encodedSpaceIdOrAlias = params.spaceIdOrAlias;
                const decodedSpaceIdOrAlias =
                  encodedSpaceIdOrAlias && decodeURIComponent(encodedSpaceIdOrAlias);

                if (decodedSpaceIdOrAlias) {
                  return redirect(getSpaceLobbyPath(decodedSpaceIdOrAlias));
                }
                return null;
              }}
              element={<WelcomePage />}
            />
          )}
          <Route path={LOBBY_PATH_SEGMENT} element={<Lobby />} />
          <Route path={SEARCH_PATH_SEGMENT} element={<SpaceSearch />} />
          <Route
            path={ROOM_PATH_SEGMENT}
            element={
              <SpaceRouteRoomProvider>
                <RoomRoute section="space" forum={false} />
              </SpaceRouteRoomProvider>
            }
          />
          <Route
            path={ROOM_FORUM_PATH_SEGMENT}
            element={
              <SpaceRouteRoomProvider>
                <RoomRoute section="space" forum />
              </SpaceRouteRoomProvider>
            }
          />
        </Route>
        <Route
          path={EXPLORE_PATH}
          element={
            <PageRoot
              rail={<SidebarNav />}
              nav={
                <Suspense fallback={<SplashScreen>{null}</SplashScreen>}>
                  <Explore />
                </Suspense>
              }
            >
              <Outlet />
            </PageRoot>
          }
        >
          {mobile ? null : (
            <Route
              index
              loader={() => redirect(getExploreFeaturedPath())}
              element={<WelcomePage />}
            />
          )}
          <Route
            path={FEATURED_PATH_SEGMENT}
            element={
              <Suspense fallback={<SplashScreen>{null}</SplashScreen>}>
                <FeaturedRooms />
              </Suspense>
            }
          />
          <Route
            path={SERVER_PATH_SEGMENT}
            element={
              <Suspense fallback={<SplashScreen>{null}</SplashScreen>}>
                <PublicRooms />
              </Suspense>
            }
          />
        </Route>
        <Route path={CREATE_PATH} element={<Create />} />
        <Route
          path={CREATE_ROOM_PATH}
          element={
            <Suspense fallback={<SplashScreen>{null}</SplashScreen>}>
              <CreateRoomPage />
            </Suspense>
          }
        />
        <Route
          path={BUG_REPORT_PATH}
          element={
            <Suspense fallback={<SplashScreen>{null}</SplashScreen>}>
              <BugReportPage />
            </Suspense>
          }
        />
        <Route path={NAVIGATE_PATH} element={<Navigate />} />
        <Route path={PROFILE_PATH} element={<ProfileMobile />} />
        <Route
          path={SETTINGS_PATH}
          element={
            <Suspense fallback={<SplashScreen>{null}</SplashScreen>}>
              <SettingsRoute />
            </Suspense>
          }
        />
        <Route
          path={INBOX_PATH}
          element={
            <PageRoot
              nav={
                <Suspense fallback={<SplashScreen>{null}</SplashScreen>}>
                  <Inbox />
                </Suspense>
              }
            >
              <Outlet />
            </PageRoot>
          }
        >
          {mobile ? null : (
            <Route
              index
              loader={() => redirect(getInboxNotificationsPath())}
              element={<WelcomePage />}
            />
          )}
          <Route
            path={NOTIFICATIONS_PATH_SEGMENT}
            element={
              <Suspense fallback={<SplashScreen>{null}</SplashScreen>}>
                <Notifications />
              </Suspense>
            }
          />
          <Route
            path={INVITES_PATH_SEGMENT}
            element={
              <Suspense fallback={<SplashScreen>{null}</SplashScreen>}>
                <Invites />
              </Suspense>
            }
          />
          <Route
            path={BOOKMARKS_PATH_SEGMENT}
            element={
              <Suspense fallback={<SplashScreen>{null}</SplashScreen>}>
                <Bookmarks />
              </Suspense>
            }
          />
        </Route>
        <Route path={TO_ROOM_EVENT_PATH} element={<ToRoomEvent />} />
      </Route>
      <Route path="/*" element={<p>Page not found</p>} />
    </Route>
  );

  if (hashRouter?.enabled) {
    return createHashRouter(routes, { basename: hashRouter.basename });
  }
  return createBrowserRouter(routes, {
    basename: import.meta.env.BASE_URL,
  });
};
