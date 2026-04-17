import type { MouseEventHandler } from 'react';
import { useRef, useState } from 'react';
import { Box, Checkbox, config, Line, Menu, MenuItem, PopOut, Scroll, Text, toRem } from 'folds';
import FocusTrap from 'focus-trap-react';
import { stopPropagation } from '$utils/keyboard';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Sidebar, SidebarContent, SidebarStackSeparator, SidebarStack } from '$components/sidebar';
import {
  DirectTab,
  DirectDMsList,
  HomeTab,
  SpaceTabs,
  InboxTab,
  ExploreTab,
  UnverifiedTab,
  SearchTab,
  AccountSwitcherTab,
} from './sidebar';
import { CreateTab } from './sidebar/CreateTab';

export function SidebarNav() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect>();

  const [uniformIcons, setUniformIcons] = useSetting(settingsAtom, 'uniformIcons');
  const [showUnreadCounts, setShowUnreadCounts] = useSetting(settingsAtom, 'showUnreadCounts');
  const [badgeCountDMsOnly, setBadgeCountDMsOnly] = useSetting(settingsAtom, 'badgeCountDMsOnly');
  const [showPingCounts, setShowPingCounts] = useSetting(settingsAtom, 'showPingCounts');

  const handleContextMenu: MouseEventHandler<HTMLDivElement> = (evt) => {
    const target = evt.target as HTMLElement;
    if (target.closest('button, a, [role="button"]')) return;
    evt.preventDefault();
    const cords = new DOMRect(evt.clientX, evt.clientY, 0, 0);
    setMenuAnchor((current) => (current ? undefined : cords));
  };

  return (
    <Sidebar onContextMenu={handleContextMenu}>
      {menuAnchor && (
        <PopOut
          anchor={menuAnchor}
          position="Right"
          align="Start"
          content={
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                returnFocusOnDeactivate: false,
                onDeactivate: () => setMenuAnchor(undefined),
                clickOutsideDeactivates: true,
                isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                escapeDeactivates: stopPropagation,
              }}
            >
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
            </FocusTrap>
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
            <SidebarStackSeparator />
            <SidebarStack>
              <ExploreTab />
              <CreateTab />
            </SidebarStack>
          </Scroll>
        }
        sticky={
          <SidebarStack>
            <SearchTab />
            <UnverifiedTab />
            <InboxTab />
            <AccountSwitcherTab />
          </SidebarStack>
        }
      />
    </Sidebar>
  );
}
