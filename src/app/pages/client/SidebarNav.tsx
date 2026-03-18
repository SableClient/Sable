import { useRef } from 'react';
import { color } from 'folds';

import {
  Sidebar,
  SidebarContent,
  SidebarStackSeparator,
  SidebarStack,
  ActiveIndicator,
  ActiveIndicatorProvider,
} from '$components/sidebar';
import { BackgroundGlow } from '$components/BackgroundGlow';
import * as sidebarCss from '$components/sidebar/Sidebar.css';
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

  return (
    <ActiveIndicatorProvider>
      <Sidebar>
        <BackgroundGlow
          color={color.Surface.Container}
          style={{ position: 'absolute', inset: 0 }}
        />
        <ActiveIndicator />
        <SidebarContent
          topSticky={
            <SidebarStack shield>
              <HomeTab />
              <DirectTab />
            </SidebarStack>
          }
          scrollable={
            <SidebarStack
              shield
              fill="Background"
              style={{
                flex: 1,
                minHeight: 0,
                padding: 0,
                justifyContent: 'flex-start',
                alignItems: 'stretch',
                overflow: 'hidden',
              }}
            >
              <div
                ref={scrollRef}
                className={sidebarCss.SidebarScrollArea}
                data-sidebar-scroll-area
              >
                <SidebarStack
                  fill="Background"
                  style={{ justifyContent: 'flex-start', minHeight: '100%' }}
                >
                  <DirectDMsList />
                  <SpaceTabs scrollRef={scrollRef} />
                  <div style={{ flexGrow: 1 }} />
                  <SidebarStackSeparator />
                  <ExploreTab />
                  <CreateTab />
                </SidebarStack>
              </div>
            </SidebarStack>
          }
          bottomSticky={
            <SidebarStack shield>
              <SearchTab />
              <UnverifiedTab />
              <InboxTab />
              <AccountSwitcherTab />
            </SidebarStack>
          }
        />
      </Sidebar>
    </ActiveIndicatorProvider>
  );
}
