import type { MouseEventHandler } from 'react';
import { useRef } from 'react';
import { Box, Checkbox, config, Line, Menu, MenuItem, Scroll, Text, toRem } from 'folds';
import { ResponsiveMenu } from '$components/ResponsiveMenu';
import { useMenuAnchor } from '$hooks/useMenuAnchor';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Sidebar, SidebarContent, SidebarStack } from '$components/sidebar';
import { DirectTab, DirectDMsList, HomeTab, SpaceTabs, InboxTab } from './sidebar';
import { CreateTab } from './sidebar/CreateTab';
import { NavigateTab } from './sidebar/NavigateTab';
import { SettingsTab } from './sidebar/SettingsTab';
import { useScreenSizeContext, ScreenSize } from '$hooks/useScreenSize';
import { UserMenuTab } from './sidebar/UserMenuTab';

export function SidebarNav() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sidebarMenu = useMenuAnchor<HTMLDivElement>();

  const [uniformIcons, setUniformIcons] = useSetting(settingsAtom, 'uniformIcons');
  const [showUnreadCounts, setShowUnreadCounts] = useSetting(settingsAtom, 'showUnreadCounts');
  const [badgeCountDMsOnly, setBadgeCountDMsOnly] = useSetting(settingsAtom, 'badgeCountDMsOnly');
  const [showPingCounts, setShowPingCounts] = useSetting(settingsAtom, 'showPingCounts');
  const [roomSidebarWidth] = useSetting(settingsAtom, 'roomSidebarWidth');

  const [oldSidebar] = useSetting(settingsAtom, 'oldSidebar');
  const screenSize = useScreenSizeContext();
  const compact = screenSize === ScreenSize.Mobile;

  const width = roomSidebarWidth + 66;
  const isCollapsed = compact ? false : width < 190 + 66;

  const handleSidebarContextMenu: MouseEventHandler<HTMLDivElement> = (evt) => {
    const target = evt.target as HTMLElement;
    if (target.closest('button, a, [role="button"]')) return;
    sidebarMenu.triggerProps.onContextMenu(evt);
  };

  return (
    <>
      <Sidebar onContextMenu={handleSidebarContextMenu}>
        {!compact && (
          <ResponsiveMenu
            anchor={sidebarMenu.anchor}
            position="Right"
            align="Start"
            requestClose={sidebarMenu.close}
            menu={
              <Menu style={{ maxWidth: toRem(208), width: '100vw' }}>
                <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                  <MenuItem
                    size="300"
                    radii="300"
                    aria-pressed={showUnreadCounts}
                    onClick={() => setShowUnreadCounts(!showUnreadCounts)}
                    after={
                      <Checkbox size="100" checked={showUnreadCounts} readOnly tabIndex={-1} />
                    }
                  >
                    <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                      Show Room Counts
                    </Text>
                  </MenuItem>
                  <MenuItem
                    size="300"
                    radii="300"
                    aria-pressed={badgeCountDMsOnly}
                    onClick={() => setBadgeCountDMsOnly(!badgeCountDMsOnly)}
                    after={
                      <Checkbox size="100" checked={badgeCountDMsOnly} readOnly tabIndex={-1} />
                    }
                  >
                    <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                      Show DM Counts
                    </Text>
                  </MenuItem>
                  <MenuItem
                    size="300"
                    radii="300"
                    aria-pressed={showPingCounts}
                    onClick={() => setShowPingCounts(!showPingCounts)}
                    after={<Checkbox size="100" checked={showPingCounts} readOnly tabIndex={-1} />}
                  >
                    <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                      Show Mention Counts
                    </Text>
                  </MenuItem>
                </Box>
                <Line variant="Surface" size="300" />
                <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                  <MenuItem
                    size="300"
                    radii="300"
                    aria-pressed={uniformIcons}
                    onClick={() => setUniformIcons(!uniformIcons)}
                    after={<Checkbox size="100" checked={uniformIcons} readOnly tabIndex={-1} />}
                  >
                    <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                      Consistent Icon Style
                    </Text>
                  </MenuItem>
                </Box>
              </Menu>
            }
          />
        )}
        <SidebarContent
          scrollable={
            <Scroll ref={scrollRef} variant="Background" size="0">
              <SidebarStack>
                <HomeTab />
                <DirectTab />
                <DirectDMsList />
              </SidebarStack>
              <SpaceTabs scrollRef={scrollRef} />
              <SidebarStack>
                <CreateTab />
              </SidebarStack>
            </Scroll>
          }
          sticky={
            <>
              {(oldSidebar || isCollapsed) && (
                <SidebarStack>
                  {oldSidebar ? (
                    <>
                      <NavigateTab />
                      <InboxTab />
                    </>
                  ) : (
                    <>
                      <NavigateTab />
                      <InboxTab />
                      <SettingsTab />
                    </>
                  )}
                </SidebarStack>
              )}
              {!compact && (
                <div
                  style={{
                    paddingBottom: config.space.S400,
                    paddingTop: !oldSidebar ? config.space.S400 : undefined,
                  }}
                >
                  <UserMenuTab />
                </div>
              )}
            </>
          }
        />
      </Sidebar>
    </>
  );
}
