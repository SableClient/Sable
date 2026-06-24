import { Box, config, toRem } from 'folds';
import { InboxTab } from './InboxTab';
import { SearchTab } from './SearchTab';
import { SettingsTab } from './SettingsTab';
import { useAtom } from 'jotai';
import { isResizingSidebarAtom } from '$state/isResizingSidebar';
import * as css from './UserQuickTools.css';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { UserMenuTab } from './UserMenuTab';

export function UserQuickTools({
  width,
}: {
  isCollapsed?: boolean;
  underOutstep?: boolean;
  width: number;
}) {
  const screenSize = useScreenSizeContext();
  const compact = screenSize === ScreenSize.Mobile;

  const [isResizingSidebar] = useAtom(isResizingSidebarAtom);
  const isCollapsed = compact ? false : width < 190 + 66;

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
            <UserMenuTab isBottom />
            <Box
              style={{
                gap: config.space.S300,
              }}
            >
              {!isCollapsed && (
                <>
                  <InboxTab isBottom />
                  <SearchTab isBottom />
                  <SettingsTab isBottom />
                </>
              )}
            </Box>
          </Box>
        </div>
      )}
    </>
  );
}
