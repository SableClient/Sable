import {
  Outlet,
  Route,
  createBrowserRouter,
  createHashRouter,
  createRoutesFromElements,
  redirect,
} from 'react-router-dom';

import { ClientConfig } from '$hooks/useClientConfig';
import { Room } from '$features/room';
import { Lobby } from '$features/lobby';
import { PageRoot } from '$components/page';
import { ScreenSize } from '$hooks/useScreenSize';
import { ReceiveSelfDeviceVerification } from '$components/DeviceVerification';
import { AutoRestoreBackupOnVerification } from '$components/BackupRestore';
import { RoomSettingsRenderer } from '$features/room-settings';
import { SpaceSettingsRenderer } from '$features/space-settings';
import { UserRoomProfileRenderer } from '$components/UserRoomProfileRenderer';
import { CreateRoomModalRenderer } from '$features/create-room';
import { CreateSpaceModalRenderer } from '$features/create-space';
import { BugReportModalRenderer } from '$features/bug-report';
import { getFallbackSession, MATRIX_SESSIONS_KEY, Sessions } from '$state/sessions';
import { getLocalStorageItem } from '$state/utils/atomWithLocalStorage';
import { NotificationJumper } from '$hooks/useNotificationJumper';
import { SearchModalRenderer } from '$features/search';
import { GlobalKeyboardShortcuts } from '$components/GlobalKeyboardShortcuts';
import { CallEmbedProvider } from '$components/CallEmbedProvider';
import { AuthLayout, Login, Register, ResetPassword } from './auth';
import {
  DIRECT_PATH,
  EXPLORE_PATH,
  HOME_PATH,
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
  SEARCH_PATH_SEGMENT,
  SERVER_PATH_SEGMENT,
  CREATE_PATH,
  TO_ROOM_EVENT_PATH,
} from './paths';
import {
  getAppPathFromHref,
  getExploreFeaturedPath,
  getHomePath,
  getInboxNotificationsPath,
  getLoginPath,
  getOriginBaseUrl,
  getSpaceLobbyPath,
} from './pathUtils';
import { ClientBindAtoms, ClientLayout, ClientRoot } from './client';
import { HandleNotificationClick, ClientNonUIFeatures } from './client/ClientNonUIFeatures';
import { Home, HomeRouteRoomProvider, HomeSearch } from './client/home';
import { Direct, DirectCreate, DirectRouteRoomProvider } from './client/direct';
import { RouteSpaceProvider, Space, SpaceRouteRoomProvider, SpaceSearch } from './client/space';
import { Explore, FeaturedRooms, PublicRooms } from './client/explore';
import { Notifications, Inbox, Invites } from './client/inbox';
import { setAfterLoginRedirectPath } from './afterLoginRedirectPath';
import { WelcomePage } from './client/WelcomePage';
import { SidebarNav } from './client/SidebarNav';
import { MobileFriendlyPageNav, MobileFriendlyClientNav } from './MobileFriendly';
import { ClientInitStorageAtom } from './client/ClientInitStorageAtom';
import { AuthRouteThemeManager, UnAuthRouteThemeManager } from './ThemeManager';
import { ClientRoomsNotificationPreferences } from './client/ClientRoomsNotificationPreferences';
import { HomeCreateRoom } from './client/home/CreateRoom';
import { Create } from './client/create';
import { ToRoomEvent } from './client/ToRoomEvent';
import { CallStatusRenderer } from './CallStatusRenderer';

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

  const routes = createRoutesFromElements(
    <Route>
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
          // Allow reaching the login page with ?addAccount=1 even when already logged in
          const url = new URL(request.url);
          if (url.searchParams.get('addAccount') === '1') return null;
          if (hasStoredSession()) return redirect(getHomePath());
          return null;
        }}
        element={
          <>
            <AuthLayout />
            <UnAuthRouteThemeManager />
          </>
        }
      >
        <Route path={LOGIN_PATH} element={<Login />} />
        <Route path={REGISTER_PATH} element={<Register />} />
        <Route path={RESET_PASSWORD_PATH} element={<ResetPassword />} />
      </Route>

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
                            <MobileFriendlyClientNav>
                              <SidebarNav />
                            </MobileFriendlyClientNav>
                          }
                        >
                          <Outlet />
                        </ClientLayout>
                        <CallStatusRenderer />
                      </CallEmbedProvider>
                      <SearchModalRenderer />
                      <UserRoomProfileRenderer />
                      <CreateRoomModalRenderer />
                      <CreateSpaceModalRenderer />
                      <BugReportModalRenderer />
                      <RoomSettingsRenderer />
                      <SpaceSettingsRenderer />
                      <GlobalKeyboardShortcuts />
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
        }
      >
        <Route
          path={HOME_PATH}
          element={
            <PageRoot
              nav={
                <MobileFriendlyPageNav path={HOME_PATH}>
                  <Home />
                </MobileFriendlyPageNav>
              }
            >
              <Outlet />
            </PageRoot>
          }
        >
          {mobile ? null : <Route index element={<WelcomePage />} />}
          <Route path={CREATE_PATH_SEGMENT} element={<HomeCreateRoom />} />
          <Route path={JOIN_PATH_SEGMENT} element={<p>join</p>} />
          <Route path={SEARCH_PATH_SEGMENT} element={<HomeSearch />} />
          <Route
            path={ROOM_PATH_SEGMENT}
            element={
              <HomeRouteRoomProvider>
                <Room />
              </HomeRouteRoomProvider>
            }
          />
        </Route>
        <Route
          path={DIRECT_PATH}
          element={
            <PageRoot
              nav={
                <MobileFriendlyPageNav path={DIRECT_PATH}>
                  <Direct />
                </MobileFriendlyPageNav>
              }
            >
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
                <Room />
              </DirectRouteRoomProvider>
            }
          />
        </Route>
        <Route
          path={SPACE_PATH}
          element={
            <RouteSpaceProvider>
              <PageRoot
                nav={
                  <MobileFriendlyPageNav path={SPACE_PATH}>
                    <Space />
                  </MobileFriendlyPageNav>
                }
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
                <Room />
              </SpaceRouteRoomProvider>
            }
          />
        </Route>
        <Route
          path={EXPLORE_PATH}
          element={
            <PageRoot
              nav={
                <MobileFriendlyPageNav path={EXPLORE_PATH}>
                  <Explore />
                </MobileFriendlyPageNav>
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
          <Route path={FEATURED_PATH_SEGMENT} element={<FeaturedRooms />} />
          <Route path={SERVER_PATH_SEGMENT} element={<PublicRooms />} />
        </Route>
        <Route path={CREATE_PATH} element={<Create />} />
        <Route
          path={INBOX_PATH}
          element={
            <PageRoot
              nav={
                <MobileFriendlyPageNav path={INBOX_PATH}>
                  <Inbox />
                </MobileFriendlyPageNav>
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
          <Route path={NOTIFICATIONS_PATH_SEGMENT} element={<Notifications />} />
          <Route path={INVITES_PATH_SEGMENT} element={<Invites />} />
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
