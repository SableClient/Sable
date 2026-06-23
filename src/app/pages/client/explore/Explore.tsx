import type { FormEventHandler, MouseEventHandler } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FocusTrap from 'focus-trap-react';
import {
  Avatar,
  Box,
  Button,
  Dialog,
  Header,
  IconButton,
  Input,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
  color,
  config,
  toRem,
} from 'folds';
import {
  Compass,
  HardDrives,
  Lightbulb,
  Plus,
  Trash,
  X,
  composerIcon,
  sizedIcon,
  menuIcon,
} from '$components/icons/phosphor';
import {
  NavCategory,
  NavCategoryHeader,
  NavItem,
  NavItemContent,
  NavItemOptions,
  NavLink,
} from '$components/nav';
import { getExploreFeaturedPath, getExploreServerPath } from '$pages/pathUtils';
import { useClientConfig } from '$hooks/useClientConfig';
import { useExploreFeaturedSelected, useExploreServer } from '$hooks/router/useExploreSelected';
import { useExploreServers } from '$hooks/useExploreServers';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useNavToActivePathMapper } from '$hooks/useNavToActivePathMapper';
import { PageNav, PageNavContent, PageNavHeader } from '$components/page';
import { stopPropagation } from '$utils/keyboard';
import { SidebarResizer } from '$pages/client/sidebar/SidebarResizer';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { mobileOrTabletLayout } from '$utils/user-agent';
import { getMxIdServer } from '$utils/mxIdHelper';
import { isServerName } from '$utils/matrix';
import { useScreenSizeContext, ScreenSize } from '$hooks/useScreenSize';
import { isResizingSidebarAtom } from '$state/isResizingSidebar';
import { useSetAtom } from 'jotai';

type AddServerProps = {
  hideText?: boolean;
  onAddServer: (server: string) => Promise<boolean>;
};

export function AddServer({ hideText, onAddServer }: AddServerProps) {
  const mx = useMatrixClient();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const serverInputRef = useRef<HTMLInputElement>(null);

  const [exploreState] = useAsyncCallback(
    useCallback((server: string) => mx.publicRooms({ server, limit: 1 }), [mx])
  );

  const getInputServer = (): string | undefined => {
    const serverInput = serverInputRef.current;
    if (!serverInput) return undefined;
    const server = serverInput.value.trim();
    return server || undefined;
  };

  const addAndNavigate = useCallback(
    async (server: string) => {
      if (!isServerName(server)) {
        setServerError('Invalid server name.');
        return;
      }

      setServerError(undefined);
      const added = await onAddServer(server);
      if (!added) {
        setServerError('Failed to save server. Please try again.');
        return;
      }

      navigate(getExploreServerPath(server));
      setDialog(false);
    },
    [navigate, onAddServer]
  );

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const server = getInputServer();
    if (!server) return;
    addAndNavigate(server).catch(() => {
      setServerError('Failed to save server. Please try again.');
    });
  };

  return (
    <>
      <Overlay open={dialog} backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              clickOutsideDeactivates: true,
              onDeactivate: () => setDialog(false),
              escapeDeactivates: stopPropagation,
            }}
          >
            <Dialog variant="Surface">
              <Header
                style={{
                  padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                  borderBottomWidth: config.borderWidth.B300,
                }}
                variant="Surface"
                size="500"
              >
                <Box grow="Yes">
                  <Text size="H4">Add Server</Text>
                </Box>
                <IconButton size="300" onClick={() => setDialog(false)} radii="300">
                  {composerIcon(X)}
                </IconButton>
              </Header>
              <Box
                as="form"
                onSubmit={handleSubmit}
                style={{ padding: config.space.S400 }}
                direction="Column"
                gap="400"
              >
                <Text priority="400">Add server name to explore public communities.</Text>
                <Box direction="Column" gap="100">
                  <Text size="L400">Server Name</Text>
                  <Input ref={serverInputRef} name="serverInput" variant="Background" required />
                  {serverError && (
                    <Text style={{ color: color.Critical.Main }} size="T300">
                      {serverError}
                    </Text>
                  )}
                  {exploreState.status === AsyncStatus.Error && (
                    <Text style={{ color: color.Critical.Main }} size="T300">
                      Failed to load public rooms. Please try again.
                    </Text>
                  )}
                </Box>
                <Box direction="Column" gap="200">
                  {/* <Button
                    type="submit"
                    variant="Secondary"
                    before={
                      exploreState.status === AsyncStatus.Loading ? (
                        <Spinner fill="Solid" variant="Secondary" size="200" />
                      ) : undefined
                    }
                    aria-disabled={exploreState.status === AsyncStatus.Loading}
                  >
                    <Text size="B400">Save</Text>
                  </Button> */}

                  <Button type="submit" variant="Secondary" fill="Soft">
                    <Text size="B400">Add</Text>
                  </Button>
                </Box>
              </Box>
            </Dialog>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
      {!hideText ? (
        <Button
          variant="Secondary"
          fill="Soft"
          size="300"
          before={menuIcon(Plus)}
          onClick={() => setDialog(true)}
        >
          <Text size="B300" truncate>
            Add Server
          </Text>
        </Button>
      ) : (
        <IconButton aria-pressed variant="Background" onClick={() => setDialog(true)}>
          {sizedIcon(Plus, '200', { filled: true })}
        </IconButton>
      )}
    </>
  );
}

export function Explore() {
  const mx = useMatrixClient();
  const navigate = useNavigate();
  useNavToActivePathMapper('explore');
  const userId = mx.getUserId();
  const clientConfig = useClientConfig();
  const { servers: addedServers, addServer, removeServer } = useExploreServers();
  const userServer = userId ? getMxIdServer(userId) : undefined;
  const featuredCommunityServers = clientConfig.featuredCommunities?.servers;
  const servers = useMemo(() => {
    const featuredServers =
      featuredCommunityServers?.filter((server) => server !== userServer) ?? [];
    const seen = new Set<string>();
    const merged: string[] = [];

    [...featuredServers, ...addedServers].forEach((server) => {
      if (server === userServer) return;
      const key = server.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(server);
    });

    return merged;
  }, [featuredCommunityServers, addedServers, userServer]);

  const featuredSelected = useExploreFeaturedSelected();
  const selectedServer = useExploreServer();

  const isUserAddedServer = useCallback(
    (server: string) => addedServers.some((entry) => entry.toLowerCase() === server.toLowerCase()),
    [addedServers]
  );

  const handleRemoveServer = useCallback(
    (server: string) => {
      removeServer(server)
        .then((removed) => {
          if (!removed) return;
          if (selectedServer?.toLowerCase() === server.toLowerCase()) {
            navigate(getExploreFeaturedPath());
          }
        })
        .catch(() => undefined);
    },
    [navigate, removeServer, selectedServer]
  );

  const handleRemoveServerClick =
    (server: string): MouseEventHandler<HTMLButtonElement> =>
    (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      handleRemoveServer(server);
    };

  const setIsResizingSidebar = useSetAtom(isResizingSidebarAtom);
  const [roomSidebarWidth, setRoomSidebarWidth] = useSetting(settingsAtom, 'roomSidebarWidth');
  const [curWidth, setCurWidth] = useState(roomSidebarWidth);

  useEffect(() => {
    setCurWidth(roomSidebarWidth);
  }, [roomSidebarWidth]);
  const screenSize = useScreenSizeContext();
  const isMobile = mobileOrTabletLayout() || screenSize === ScreenSize.Mobile;
  const hideText = curWidth <= 80 && !isMobile;

  return (
    <Box
      shrink="No"
      style={{
        position: 'relative',
        width: isMobile ? '100%' : toRem(curWidth),
      }}
    >
      <PageNav>
        <PageNavHeader size="600">
          <Box grow="Yes" gap="300" justifyContent="Center">
            {!hideText ? (
              <Box grow="Yes">
                <Text size="H4" truncate>
                  Explore Community
                </Text>
              </Box>
            ) : (
              sizedIcon(Compass, '200', { filled: true })
            )}
          </Box>
        </PageNavHeader>

        <PageNavContent>
          <Box direction="Column" gap="300">
            <NavCategory>
              <NavItem variant="Background" radii="400" aria-selected={featuredSelected}>
                <NavLink to={getExploreFeaturedPath()}>
                  <NavItemContent>
                    <Box as="span" grow="Yes" alignItems="Center" gap="200">
                      <Avatar
                        size="200"
                        radii="400"
                        style={hideText ? { width: '100%', padding: '0' } : { height: '100%' }}
                      >
                        {sizedIcon(Lightbulb, '100', { filled: featuredSelected })}
                      </Avatar>
                      {!hideText && (
                        <Box as="span" grow="Yes">
                          <Text as="span" size="Inherit" truncate>
                            Featured
                          </Text>
                        </Box>
                      )}
                    </Box>
                  </NavItemContent>
                </NavLink>
              </NavItem>
              {userServer && (
                <NavItem
                  variant="Background"
                  radii="400"
                  aria-selected={selectedServer === userServer}
                >
                  <NavLink to={getExploreServerPath(userServer)}>
                    <NavItemContent>
                      <Box as="span" grow="Yes" alignItems="Center" gap="200">
                        <Avatar
                          size="200"
                          radii="400"
                          style={hideText ? { width: '100%', padding: '0' } : { height: '100%' }}
                        >
                          {sizedIcon(HardDrives, '100', { filled: selectedServer === userServer })}
                        </Avatar>
                        {!hideText && (
                          <Box as="span" grow="Yes">
                            <Text as="span" size="Inherit" truncate>
                              {userServer}
                            </Text>
                          </Box>
                        )}
                      </Box>
                    </NavItemContent>
                  </NavLink>
                </NavItem>
              )}
            </NavCategory>
            {servers.length > 0 && (
              <NavCategory>
                <NavCategoryHeader>
                  {!hideText && (
                    <Text size="O400" style={{ paddingLeft: config.space.S200 }}>
                      Servers
                    </Text>
                  )}
                </NavCategoryHeader>
                {servers.map((server) => (
                  <NavItem
                    key={server}
                    variant="Background"
                    radii="400"
                    aria-selected={server === selectedServer}
                  >
                    <NavLink to={getExploreServerPath(server)}>
                      <NavItemContent>
                        <Box as="span" grow="Yes" alignItems="Center" gap="200">
                          <Avatar
                            size="200"
                            radii="400"
                            style={hideText ? { width: '100%', padding: '0' } : { height: '100%' }}
                          >
                            {sizedIcon(HardDrives, '100', { filled: server === selectedServer })}
                          </Avatar>
                          {!hideText && (
                            <Box as="span" grow="Yes">
                              <Text as="span" size="Inherit" truncate>
                                {server}
                              </Text>
                            </Box>
                          )}
                        </Box>
                      </NavItemContent>
                    </NavLink>
                    {!hideText && isUserAddedServer(server) && (
                      <NavItemOptions>
                        <IconButton
                          size="300"
                          variant="Critical"
                          fill="None"
                          radii="300"
                          aria-label={`Remove ${server}`}
                          onClick={handleRemoveServerClick(server)}
                        >
                          {menuIcon(Trash)}
                        </IconButton>
                      </NavItemOptions>
                    )}
                  </NavItem>
                ))}
              </NavCategory>
            )}
            <Box direction="Column">
              <AddServer hideText={hideText} onAddServer={addServer} />
            </Box>
          </Box>
        </PageNavContent>
      </PageNav>
      {!mobileOrTabletLayout() && (
        <SidebarResizer
          setCurWidth={setCurWidth}
          sidebarWidth={roomSidebarWidth}
          setSidebarWidth={setRoomSidebarWidth}
          instep={80}
          outstep={190}
          minValue={50}
          maxValue={500}
          setAnnouncement={setIsResizingSidebar}
        />
      )}
    </Box>
  );
}
