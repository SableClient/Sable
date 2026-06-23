import { Box, config, toRem } from 'folds';
import { AccountSwitcherTab } from './AccountSwitcherTab';
import { UnverifiedTab } from './UnverifiedTab';
import { InboxTab } from './InboxTab';
import { SearchTab } from './SearchTab';
import { SettingsTab } from './SettingsTab';
import { useAtom } from 'jotai';
import { isResizingSidebarAtom } from '$state/isResizingSidebar';
import * as css from './UserQuickTools.css';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';

export function UserQuickTools({
  width,
}: {
  isCollapsed?: boolean;
  underOutstep?: boolean;
  width: number;
}) {
  const [isResizingSidebar] = useAtom(isResizingSidebarAtom);
  const underOutstep = width < 190 + 66;
  const isCollapsed = width < 50 + 66;

  const screenSize = useScreenSizeContext();
  const compact = screenSize === ScreenSize.Mobile;

  return (
    <>
      {/* Doing it properly and nicely would require a major rewrite that would cause more trouble*/}
      {!isCollapsed && (
        <div style={{ position: 'relative' }}>
          <Box
            direction="Row"
            justifyContent="SpaceBetween"
            alignItems="Center"
            className={css.UserQuickTools}
            style={{
              opacity: isResizingSidebar ? '0%' : '100%',
              transition: isResizingSidebar ? 'opacity 0.2s ease' : 'opacity 0.5s ease',
              width: compact ? '100vw' : toRem(width),
              paddingRight: config.space.S300,
            }}
          >
            <AccountSwitcherTab isBottom />
            <Box
              style={{
                gap: config.space.S300,
              }}
            >
              {!underOutstep && (
                <>
                  <UnverifiedTab isBottom />
                  <InboxTab isBottom />
                  <SearchTab isBottom />
                </>
              )}
              <SettingsTab isBottom />
            </Box>
          </Box>
        </div>
      )}
    </>
  );
}
