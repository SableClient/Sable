import { useMemo, useState, ComponentType } from 'react';
import {
  Avatar,
  Box,
  Button,
  config,
  IconButton,
  MenuItem,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import type { IconProps } from '@phosphor-icons/react';
import { BellIcon } from '@phosphor-icons/react/dist/csr/Bell';
import { CodeIcon } from '@phosphor-icons/react/dist/csr/Code';
import { FunnelIcon } from '@phosphor-icons/react/dist/csr/Funnel';
import { GearIcon } from '@phosphor-icons/react/dist/csr/Gear';
import { InfoIcon } from '@phosphor-icons/react/dist/csr/Info';
import { MonitorIcon } from '@phosphor-icons/react/dist/csr/Monitor';
import { PowerIcon } from '@phosphor-icons/react/dist/csr/Power';
import { SmileyIcon } from '@phosphor-icons/react/dist/csr/Smiley';
import { TerminalIcon } from '@phosphor-icons/react/dist/csr/Terminal';
import { TextAaIcon } from '@phosphor-icons/react/dist/csr/TextAa';
import { TextBIcon } from '@phosphor-icons/react/dist/csr/TextB';
import { UserIcon } from '@phosphor-icons/react/dist/csr/User';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { PageNav, PageNavContent, PageNavHeader, PageRoot } from '$components/page';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useUserProfile } from '$hooks/useUserProfile';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { UserAvatar } from '$components/user-avatar';
import { nameInitials } from '$utils/common';
import { UseStateProvider } from '$components/UseStateProvider';
import { stopPropagation } from '$utils/keyboard';
import { LogoutDialog } from '$components/LogoutDialog';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { PhosphorIcon } from '$components/PhosphorIcon';
import { Notifications } from './notifications';
import { Devices } from './devices';
import { EmojisStickers } from './emojis-stickers';
import { DeveloperTools } from './developer-tools';
import { About } from './about';
import { Account } from './account';
import { General } from './general';
import { Cosmetics } from './cosmetics/Cosmetics';
import { Experimental } from './experimental/Experimental';
import { KeyboardShortcuts } from './keyboard-shortcuts';
import { PerMessageProfilePage } from './Persona/ProfilesPage';

export enum SettingsPages {
  GeneralPage,
  AccountPage,
  PerMessageProfilesPage,
  NotificationPage,
  DevicesPage,
  EmojisStickersPage,
  CosmeticsPage,
  DeveloperToolsPage,
  ExperimentalPage,
  AboutPage,
  KeyboardShortcutsPage,
}

type SettingsMenuItem = {
  page: SettingsPages;
  name: string;
  icon: ComponentType<IconProps>;
  activeIcon?: ComponentType<IconProps>;
};

const useSettingsMenuItems = (showPersona: boolean): SettingsMenuItem[] =>
  useMemo(() => {
    const items: SettingsMenuItem[] = [
      {
        page: SettingsPages.GeneralPage,
        name: 'General',
        icon: GearIcon,
      },
      {
        page: SettingsPages.AccountPage,
        name: 'Account',
        icon: UserIcon,
      },
      {
        page: SettingsPages.CosmeticsPage,
        name: 'Appearance',
        icon: TextAaIcon,
        activeIcon: TextBIcon,
      },
      {
        page: SettingsPages.NotificationPage,
        name: 'Notifications',
        icon: BellIcon,
      },
      {
        page: SettingsPages.DevicesPage,
        name: 'Devices',
        icon: MonitorIcon,
      },
      {
        page: SettingsPages.EmojisStickersPage,
        name: 'Emojis & Stickers',
        icon: SmileyIcon,
      },
      {
        page: SettingsPages.DeveloperToolsPage,
        name: 'Developer Tools',
        icon: TerminalIcon,
      },
      {
        page: SettingsPages.ExperimentalPage,
        name: 'Experimental',
        icon: FunnelIcon,
      },
      {
        page: SettingsPages.AboutPage,
        name: 'About',
        icon: InfoIcon,
      },
      {
        page: SettingsPages.KeyboardShortcutsPage,
        name: 'Keyboard Shortcuts',
        icon: CodeIcon,
      },
    ];

    if (showPersona) {
      items.splice(2, 0, {
        page: SettingsPages.PerMessageProfilesPage,
        name: 'Persona',
        icon: UserIcon,
      });
    }

    return items;
  }, [showPersona]);

type SettingsProps = {
  initialPage?: SettingsPages;
  requestClose: () => void;
};
export function Settings({ initialPage, requestClose }: SettingsProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const userId = mx.getUserId()!;
  const profile = useUserProfile(userId);
  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = profile.avatarUrl
    ? (mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined)
    : undefined;

  const [showPersona] = useSetting(settingsAtom, 'showPersonaSetting');

  const screenSize = useScreenSizeContext();
  const [activePage, setActivePage] = useState<SettingsPages | undefined>(() => {
    if (initialPage === SettingsPages.PerMessageProfilesPage && !showPersona) {
      return SettingsPages.GeneralPage;
    }
    if (initialPage) return initialPage;
    return screenSize === ScreenSize.Mobile ? undefined : SettingsPages.GeneralPage;
  });

  const menuItems = useSettingsMenuItems(showPersona);

  const handlePageRequestClose = () => {
    if (screenSize === ScreenSize.Mobile) {
      setActivePage(undefined);
      return;
    }
    requestClose();
  };

  return (
    <PageRoot
      nav={
        screenSize === ScreenSize.Mobile && activePage !== undefined ? undefined : (
          <PageNav size="300">
            <PageNavHeader outlined={false}>
              <Box grow="Yes" gap="200">
                <Avatar size="200" radii="300">
                  <UserAvatar
                    userId={userId}
                    src={avatarUrl}
                    renderFallback={() => <Text size="H6">{nameInitials(displayName)}</Text>}
                  />
                </Avatar>
                <Text size="H4" truncate>
                  Settings
                </Text>
              </Box>
              <Box shrink="No">
                {screenSize === ScreenSize.Mobile && (
                  <IconButton onClick={requestClose} variant="Background">
                    <PhosphorIcon as={XIcon} />
                  </IconButton>
                )}
              </Box>
            </PageNavHeader>
            <Box grow="Yes" direction="Column">
              <PageNavContent>
                <div style={{ flexGrow: 1 }}>
                  {menuItems.map((item) => {
                    const currentIcon =
                      activePage === item.page && item.activeIcon ? item.activeIcon : item.icon;

                    return (
                      <MenuItem
                        key={item.name}
                        variant="Background"
                        radii="400"
                        aria-pressed={activePage === item.page}
                        before={
                          <PhosphorIcon
                            as={currentIcon}
                            size="100"
                            weight={activePage === item.page ? 'fill' : 'regular'}
                          />
                        }
                        onClick={() => setActivePage(item.page)}
                      >
                        <Text
                          style={{
                            fontWeight:
                              activePage === item.page ? config.fontWeight.W600 : undefined,
                          }}
                          size="T300"
                          truncate
                        >
                          {item.name}
                        </Text>
                      </MenuItem>
                    );
                  })}
                </div>
              </PageNavContent>
              <Box style={{ padding: config.space.S200 }} shrink="No" direction="Column">
                <UseStateProvider initial={false}>
                  {(logout, setLogout) => (
                    <>
                      <Button
                        size="300"
                        variant="Critical"
                        fill="None"
                        radii="Pill"
                        before={<PhosphorIcon as={PowerIcon} size="100" />}
                        onClick={() => setLogout(true)}
                      >
                        <Text size="B400">Logout</Text>
                      </Button>
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
              </Box>
            </Box>
          </PageNav>
        )
      }
    >
      {activePage === SettingsPages.GeneralPage && (
        <General requestClose={handlePageRequestClose} />
      )}
      {activePage === SettingsPages.AccountPage && (
        <Account requestClose={handlePageRequestClose} />
      )}
      {activePage === SettingsPages.PerMessageProfilesPage && showPersona && (
        <PerMessageProfilePage requestClose={handlePageRequestClose} />
      )}
      {activePage === SettingsPages.CosmeticsPage && (
        <Cosmetics requestClose={handlePageRequestClose} />
      )}
      {activePage === SettingsPages.NotificationPage && (
        <Notifications requestClose={handlePageRequestClose} />
      )}
      {activePage === SettingsPages.DevicesPage && (
        <Devices requestClose={handlePageRequestClose} />
      )}
      {activePage === SettingsPages.EmojisStickersPage && (
        <EmojisStickers requestClose={handlePageRequestClose} />
      )}
      {activePage === SettingsPages.DeveloperToolsPage && (
        <DeveloperTools requestClose={handlePageRequestClose} />
      )}
      {activePage === SettingsPages.ExperimentalPage && (
        <Experimental requestClose={handlePageRequestClose} />
      )}
      {activePage === SettingsPages.AboutPage && <About requestClose={handlePageRequestClose} />}
      {activePage === SettingsPages.KeyboardShortcutsPage && (
        <KeyboardShortcuts requestClose={handlePageRequestClose} />
      )}
    </PageRoot>
  );
}
