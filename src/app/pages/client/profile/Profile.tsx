import {
  Box,
  toRem,
  Text,
  color,
  config,
  Menu,
  Line,
  MenuItem,
  OverlayBackdrop,
  Overlay,
  OverlayCenter,
} from 'folds';
import { GearSix, SquaresFour, menuIcon, sizedIcon } from '$components/icons/phosphor';
import { PageNav, PageNavHeader } from '$components/page';
import { useEffect, useMemo, useState } from 'react';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { SidebarResizer } from '../sidebar/SidebarResizer';
import { useSetAtom } from 'jotai';
import { isResizingSidebarAtom } from '$state/isResizingSidebar';
import {
  AccountMenuOption,
  PresenceMenuOption,
  UnverifiedMenuOption,
} from '../sidebar/UserMenuTab';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { GlobalUserHeroName, UserHero } from '$components/user-profile/UserHero';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useUserPresence } from '$hooks/useUserPresence';
import { useUserProfile } from '$hooks/useUserProfile';
import type { SettingsMenuItem } from '$features/settings';
import { settingsMenuIcons, settingsSections, useOpenSettings } from '$features/settings';
import { UserQuickTools } from '../sidebar/UserQuickTools';
import {
  CaretDownIcon,
  CaretRightIcon,
  PencilSimpleIcon,
  SignOutIcon,
} from '@phosphor-icons/react';
import { UseStateProvider } from '$components/UseStateProvider';
import { FocusTrap } from 'focus-trap-react';
import { LogoutDialog } from '$components/LogoutDialog';
import { stopPropagation } from '$utils/keyboard';
import { getMxIdServer } from '$utils/mxIdHelper';

export function ProfileMobile() {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const openSettings = useOpenSettings();
  const [oldSidebar] = useSetting(settingsAtom, 'oldSidebar');

  const userId = mx.getUserId() ?? '';
  const server = getMxIdServer(userId);
  const profile = useUserProfile(userId);
  const presence = useUserPresence(userId);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const heroAvatarUrl = profile.avatarUrl
    ? (mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 160, 160, 'crop') ?? undefined)
    : undefined;

  const parsedBanner =
    typeof profile.bannerUrl === 'string' ? profile.bannerUrl.replace(/^"|"$/g, '') : undefined;
  const heroBannerUrl = parsedBanner
    ? (mxcUrlToHttp(mx, parsedBanner, useAuthentication, 640, 192, 'scale') ?? undefined)
    : undefined;

  const setIsResizingSidebar = useSetAtom(isResizingSidebarAtom);
  const [roomSidebarWidth, setRoomSidebarWidth] = useSetting(settingsAtom, 'roomSidebarWidth');
  const [curWidth, setCurWidth] = useState(roomSidebarWidth);

  useEffect(() => {
    setCurWidth(roomSidebarWidth);
  }, [roomSidebarWidth]);
  const screenSize = useScreenSizeContext();
  const isMobile = screenSize === ScreenSize.Mobile;
  const hideText = curWidth <= 80 && !isMobile;

  const [showPersona] = useSetting(settingsAtom, 'showPersonaSetting');
  const menuItems = useMemo<SettingsMenuItem[]>(
    () =>
      settingsSections
        .filter((section) => showPersona || section.id !== 'persona')
        .map((section) => {
          const icon = settingsMenuIcons[section.id];
          return { id: section.id, name: section.label, ...icon };
        }),
    [showPersona]
  );

  return (
    <>
      {!isMobile && (
        <Box
          shrink="No"
          style={{
            position: 'relative',
            width: toRem(curWidth),
            borderRight: 'solid',
            borderColor: color.SurfaceVariant.ContainerLine,
            borderWidth: `0 ${config.borderWidth.B300} 0 0`,
          }}
        >
          <PageNav>
            <PageNavHeader size="600">
              <Box grow="Yes" gap="300" justifyContent="Center">
                {!hideText ? (
                  <Box grow="Yes">
                    <Text size="H4" truncate align="Center">
                      Profile
                    </Text>
                  </Box>
                ) : (
                  sizedIcon(SquaresFour, '200', { filled: true })
                )}
              </Box>
            </PageNavHeader>
            <SidebarResizer
              setCurWidth={setCurWidth}
              sidebarWidth={roomSidebarWidth}
              setSidebarWidth={setRoomSidebarWidth}
              instep={50}
              outstep={190}
              minValue={50}
              maxValue={500}
              setAnnouncement={setIsResizingSidebar}
            />
          </PageNav>
          {!oldSidebar && !isMobile && <UserQuickTools width={curWidth + 66} compact={false} />}
        </Box>
      )}
      <Box
        direction="Column"
        gap="0"
        alignItems="Center"
        justifyContent="SpaceBetween"
        style={{ width: '100%', minWidth: '100%', height: '100vh' }}
      >
        <PageNavHeader size="600">
          <Box grow="Yes" gap="300" justifyContent="Center">
            <Box grow="Yes">
              <Text size="H4" align="Center" truncate style={{ width: '100%' }}>
                Account
              </Text>
            </Box>
          </Box>
        </PageNavHeader>
        <Menu
          style={{
            minWidth: '100%',
            minHeight: '100%',
            overflowY: 'scroll',
            border: 'none',
            background: color.Background.Container,
          }}
        >
          <Box direction="Column" gap="200">
            <UserHero
              userId={userId}
              avatarUrl={heroAvatarUrl}
              bannerUrl={heroBannerUrl}
              presence={presence}
              showColor={false}
              allowEditing={true}
            />

            <Box style={{ padding: `0 ${config.space.S400}` }}>
              <GlobalUserHeroName displayName={displayName} userId={userId} server={server} />
            </Box>
          </Box>

          <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
            <UnverifiedMenuOption />
            <MenuItem
              size="300"
              radii="300"
              before={menuIcon(PencilSimpleIcon)}
              style={{
                background: isSettingsOpen ? color.Surface.Container : color.Background.Container,
              }}
              onClick={() => openSettings('account')}
            >
              <Text style={{ flexGrow: 1 }} size="T300">
                Edit profile
              </Text>
            </MenuItem>
          </Box>
          <Line variant="Surface" size="300" />

          <Box direction="Column" style={{ padding: config.space.S100 }}>
            <PresenceMenuOption isMobile />
          </Box>
          <AccountMenuOption isMobile />

          <Line variant="Surface" size="300" />

          <Box direction="Column" style={{ padding: config.space.S100 }}>
            <MenuItem
              size="300"
              radii="300"
              before={menuIcon(GearSix)}
              style={{
                background: isSettingsOpen ? color.Surface.Container : color.Background.Container,
              }}
              after={menuIcon(isSettingsOpen && isMobile ? CaretDownIcon : CaretRightIcon)}
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            >
              <Text style={{ flexGrow: 1 }} size="T300">
                Settings
              </Text>
            </MenuItem>
            {isSettingsOpen && (
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                {menuItems.map((item) => {
                  const IconComponent = item.icon;

                  return (
                    <MenuItem
                      key={item.id}
                      radii="300"
                      size="300"
                      variant="Background"
                      before={menuIcon(IconComponent)}
                      onClick={() => openSettings(item.id)}
                    >
                      <Text size="T300" truncate>
                        {item.name}
                      </Text>
                    </MenuItem>
                  );
                })}
              </Box>
            )}

            <UseStateProvider initial={false}>
              {(logout, setLogout) => (
                <>
                  <Line variant="Surface" size="300" />
                  <MenuItem
                    size="300"
                    variant="Background"
                    style={{ color: color.Critical.OnContainer }}
                    before={menuIcon(SignOutIcon)}
                    onClick={() => setLogout(true)}
                  >
                    <Text size="T300">Logout</Text>
                  </MenuItem>
                  {logout && (
                    <Overlay open backdrop={<OverlayBackdrop />}>
                      <OverlayCenter>
                        <FocusTrap
                          focusTrapOptions={{
                            onDeactivate: () => setLogout(false),
                            clickOutsideDeactivates: true,
                            escapeDeactivates: stopPropagation,
                          }}
                        >
                          <LogoutDialog handleClose={() => setLogout(false)} />
                        </FocusTrap>
                      </OverlayCenter>
                    </Overlay>
                  )}
                </>
              )}
            </UseStateProvider>
            <div style={{ height: toRem(132) }} />
          </Box>
        </Menu>
      </Box>
    </>
  );
}
