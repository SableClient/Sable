import { useMemo, useState } from 'react';
import type { ComponentType, JSX, ReactNode } from 'react';
import { DesktopIcon, PersonSimpleCircleIcon, type IconProps } from '@phosphor-icons/react';
import { Avatar, Box, Button, config, Input, MenuItem, Text } from 'folds';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useUserProfile } from '$hooks/useUserProfile';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { UserAvatar } from '$components/user-avatar';
import { nameInitials } from '$utils/common';
import { UseStateProvider } from '$components/UseStateProvider';
import { LogoutDialogOverlay } from '$components/LogoutDialogOverlay';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import {
  Bell,
  Devices as DevicesIcon,
  Flask,
  GearSix,
  Info,
  Keyboard,
  MagnifyingGlass,
  menuIcon,
  SignOut,
  Palette,
  sizedIcon,
  Smiley,
  Terminal,
  User,
  UsersThree,
} from '$components/icons/phosphor';
import { SettingsShell, type SectionDescriptor } from '$components/SettingsShell';
import { About } from './about';
import { Account } from './account';
import { Cosmetics } from './cosmetics/Cosmetics';
import { DeveloperTools } from './developer-tools';
import { Devices } from './devices';
import { EmojisStickers } from './emojis-stickers';
import { Experimental } from './experimental/Experimental';
import { General } from './general';
import { KeyboardShortcuts } from './keyboard-shortcuts';
import { Notifications } from './notifications';
import { PerMessageProfilePage } from './Persona/ProfilesPage';
import { settingsSections, type SettingsSectionId } from './routes';
import { searchSettings, type SettingsSearchEntry } from './settingsSearch';
import { useSettingsFocus } from './useSettingsFocus';
import { SettingsLinkProvider } from './SettingsLinkContext';
import { useSettingsLinkBaseUrl } from './useSettingsLinkBaseUrl';
import { Desktop } from './desktop';
import { isDesktopTauri } from '$utils/platform';
import { Accessibility } from './accessibility/Accessibility';

enum SettingsPages {
  GeneralPage,
  AccountPage,
  AccessibilityPage,
  PerMessageProfilesPage,
  NotificationPage,
  DevicesPage,
  DesktopPage,
  EmojisStickersPage,
  CosmeticsPage,
  DeveloperToolsPage,
  ExperimentalPage,
  AboutPage,
  KeyboardShortcutsPage,
}

type PhosphorIcon = ComponentType<IconProps>;

export type SettingsMenuItem = {
  id: SettingsSectionId;
  name: string;
  icon: PhosphorIcon;
  activeIcon?: PhosphorIcon;
};

const settingsMenuIcons: Record<
  SettingsSectionId,
  Pick<SettingsMenuItem, 'icon' | 'activeIcon'>
> = {
  general: { icon: GearSix },
  account: { icon: User },
  persona: { icon: UsersThree },
  appearance: { icon: Palette },
  accessibility: { icon: PersonSimpleCircleIcon },
  notifications: { icon: Bell },
  devices: { icon: DevicesIcon },
  desktop: { icon: DesktopIcon },
  emojis: { icon: Smiley },
  'developer-tools': { icon: Terminal },
  experimental: { icon: Flask },
  about: { icon: Info },
  'keyboard-shortcuts': { icon: Keyboard },
};

const settingsPageToSectionId: Record<SettingsPages, SettingsSectionId> = {
  [SettingsPages.GeneralPage]: 'general',
  [SettingsPages.AccountPage]: 'account',
  [SettingsPages.AccessibilityPage]: 'accessibility',
  [SettingsPages.PerMessageProfilesPage]: 'persona',
  [SettingsPages.NotificationPage]: 'notifications',
  [SettingsPages.DevicesPage]: 'devices',
  [SettingsPages.DesktopPage]: 'desktop',
  [SettingsPages.EmojisStickersPage]: 'emojis',
  [SettingsPages.CosmeticsPage]: 'appearance',
  [SettingsPages.DeveloperToolsPage]: 'developer-tools',
  [SettingsPages.ExperimentalPage]: 'experimental',
  [SettingsPages.AboutPage]: 'about',
  [SettingsPages.KeyboardShortcutsPage]: 'keyboard-shortcuts',
};

const settingsSectionIdToPage: Record<SettingsSectionId, SettingsPages> = {
  general: SettingsPages.GeneralPage,
  account: SettingsPages.AccountPage,
  persona: SettingsPages.PerMessageProfilesPage,
  appearance: SettingsPages.CosmeticsPage,
  accessibility: SettingsPages.AccessibilityPage,
  notifications: SettingsPages.NotificationPage,
  devices: SettingsPages.DevicesPage,
  desktop: SettingsPages.DesktopPage,
  emojis: SettingsPages.EmojisStickersPage,
  'developer-tools': SettingsPages.DeveloperToolsPage,
  experimental: SettingsPages.ExperimentalPage,
  about: SettingsPages.AboutPage,
  'keyboard-shortcuts': SettingsPages.KeyboardShortcutsPage,
};

const settingsSectionComponents = {
  general: General,
  account: Account,
  persona: PerMessageProfilePage,
  appearance: Cosmetics,
  accessibility: Accessibility,
  notifications: Notifications,
  devices: Devices,
  desktop: Desktop,
  emojis: EmojisStickers,
  'developer-tools': DeveloperTools,
  experimental: Experimental,
  about: About,
  'keyboard-shortcuts': KeyboardShortcuts,
} as const satisfies Record<
  SettingsSectionId,
  (props: { requestBack?: () => void; requestClose: () => void }) => JSX.Element | null
>;

type ControlledSettingsProps = {
  activeSection?: SettingsSectionId | null;
  onSelectSection?: (section: SettingsSectionId) => void;
  onSelectSetting?: (section: SettingsSectionId, focus: string) => void;
  onBack?: () => void;
  requestClose: () => void;
  initialPage?: SettingsPages;
};

type SectionWrapperProps = {
  children: ReactNode;
  section: SettingsSectionId;
  baseUrl: string;
};

function SettingsSectionProvider({ children, section, baseUrl }: SectionWrapperProps) {
  useSettingsFocus();
  return <SettingsLinkProvider value={{ section, baseUrl }}>{children}</SettingsLinkProvider>;
}

export function Settings({
  activeSection,
  onSelectSection,
  onSelectSetting,
  onBack,
  requestClose,
  initialPage,
}: ControlledSettingsProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const userId = mx.getUserId()!;
  const profile = useUserProfile(userId);
  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = profile.avatarUrl
    ? (mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined)
    : undefined;

  const [showPersona] = useSetting(settingsAtom, 'showPersonaSetting');
  const isDesktop = isDesktopTauri();
  const settingsLinkBaseUrl = useSettingsLinkBaseUrl();
  const screenSize = useScreenSizeContext();
  const isControlled = activeSection !== undefined;

  const [legacyActivePage, setLegacyActivePage] = useState<SettingsPages | undefined>(() => {
    if (initialPage === SettingsPages.PerMessageProfilesPage && !showPersona) {
      return SettingsPages.GeneralPage;
    }
    if (initialPage === SettingsPages.DesktopPage && !isDesktop) {
      return SettingsPages.GeneralPage;
    }
    if (initialPage) return initialPage;
    return screenSize === ScreenSize.Mobile ? undefined : SettingsPages.GeneralPage;
  });

  const visibleSection = useMemo<SettingsSectionId | null>(() => {
    if (isControlled) return activeSection;

    if (legacyActivePage === undefined) {
      return null;
    }

    const section = settingsPageToSectionId[legacyActivePage];
    if (section === 'persona' && !showPersona) {
      return 'general';
    }
    if (section === 'desktop' && !isDesktop) {
      return 'general';
    }
    return section;
  }, [activeSection, isControlled, legacyActivePage, showPersona, isDesktop]);

  const handleSelectSection = (section: SettingsSectionId) => {
    if (isControlled) {
      onSelectSection?.(section);
      return;
    }

    setLegacyActivePage(settingsSectionIdToPage[section]);
  };

  const handleRequestClose = () => {
    if (isControlled) {
      requestClose();
      return;
    }

    if (screenSize === ScreenSize.Mobile) {
      setLegacyActivePage(undefined);
      return;
    }

    requestClose();
  };

  const handleRequestBack = () => {
    if (isControlled) {
      onBack?.();
      return;
    }

    if (screenSize === ScreenSize.Mobile) {
      setLegacyActivePage(undefined);
      return;
    }

    setLegacyActivePage(SettingsPages.GeneralPage);
  };

  const sections = useMemo<Record<SettingsSectionId, SectionDescriptor>>(() => {
    const result = {} as Record<SettingsSectionId, SectionDescriptor>;
    for (const sec of settingsSections) {
      const icons = settingsMenuIcons[sec.id];
      result[sec.id] = {
        label: sec.label,
        icon: icons.icon,
        activeIcon: icons.activeIcon,
        Component: settingsSectionComponents[sec.id],
      };
    }
    return result;
  }, []);

  const visibleSectionIds = useMemo<SettingsSectionId[]>(
    () =>
      settingsSections
        .filter(
          (sec) => (showPersona || sec.id !== 'persona') && (isDesktop || sec.id !== 'desktop')
        )
        .map((sec) => sec.id),
    [showPersona, isDesktop]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const searchResults = useMemo(() => searchSettings(searchQuery), [searchQuery]);
  const isSearching = searchQuery.trim().length > 0;
  const menuItemTextSize = screenSize === ScreenSize.Mobile ? 'T400' : 'T300';

  const handleSearchResultSelect = (entry: SettingsSearchEntry) => {
    setSearchQuery('');
    onSelectSetting?.(entry.section, entry.focusId);
  };

  const renderHeader = useMemo(
    () =>
      (closeButton: ReactNode): ReactNode => (
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
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
          <Box shrink="No">{closeButton}</Box>
        </Box>
      ),
    [userId, avatarUrl, displayName]
  );

  return (
    <SettingsShell
      sections={sections}
      sectionIds={visibleSectionIds}
      active={visibleSection}
      onSelect={handleSelectSection}
      onBack={handleRequestBack}
      requestClose={handleRequestClose}
      renderHeader={renderHeader}
      showCloseInHeader={visibleSection === null}
      menuItemTextSize={menuItemTextSize}
      closeButtonAriaLabel="Close settings"
      searchBar={
        <Input
          variant="SurfaceVariant"
          size="400"
          placeholder="Search settings"
          maxLength={50}
          value={searchQuery}
          onChange={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
          before={sizedIcon(MagnifyingGlass, '50')}
          style={{ width: '100%' }}
        />
      }
      searchResults={
        isSearching ? (
          searchResults.length > 0 ? (
            searchResults.map((entry) => (
              <MenuItem
                key={`${entry.section}-${entry.focusId}`}
                variant="Background"
                radii="400"
                before={sizedIcon(MagnifyingGlass, '50')}
                onClick={() => handleSearchResultSelect(entry)}
              >
                <Box direction="Column">
                  <Text size={menuItemTextSize} truncate>
                    {entry.label}
                  </Text>
                  <Text size="T200" truncate>
                    {entry.sectionLabel}
                  </Text>
                </Box>
              </MenuItem>
            ))
          ) : (
            <Box style={{ padding: config.space.S300 }} alignItems="Center" justifyContent="Center">
              <Text size="T300">No results found</Text>
            </Box>
          )
        ) : undefined
      }
      renderSection={(viewport) =>
        visibleSection ? (
          <SettingsSectionProvider section={visibleSection} baseUrl={settingsLinkBaseUrl}>
            {viewport}
          </SettingsSectionProvider>
        ) : null
      }
      footer={
        <Box style={{ padding: config.space.S200 }} shrink="No" direction="Column">
          <UseStateProvider initial={false}>
            {(logout, setLogout) => (
              <>
                <Button
                  size="300"
                  variant="Critical"
                  fill="None"
                  radii="Pill"
                  before={menuIcon(SignOut)}
                  onClick={() => setLogout(true)}
                >
                  <Text size="B400">Logout</Text>
                </Button>
                {logout && <LogoutDialogOverlay requestClose={() => setLogout(false)} />}
              </>
            )}
          </UseStateProvider>
        </Box>
      }
    />
  );
}
