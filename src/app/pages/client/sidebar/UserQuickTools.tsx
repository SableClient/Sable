import { Box, config, toRem } from 'folds';
import { InboxTab } from './InboxTab';
import { NavigateTab } from './NavigateTab';
import { SettingsTab } from './SettingsTab';
import { useAtom } from 'jotai';
import { isResizingSidebarAtom } from '$state/isResizingSidebar';
import * as css from './UserQuickTools.css';
import { UserMenuTab } from './UserMenuTab';
import { MessageTab } from './MessageTab';

export function UserQuickTools({
  width,
  compact,
}: {
  isCollapsed?: boolean;
  underOutstep?: boolean;
  width?: number;
  compact: boolean;
}) {
  const [isResizingSidebar] = useAtom(isResizingSidebarAtom);
  const isCollapsed = compact ? false : (width ?? 0) < 190 + 66;

  return (
    <>
      {/* Doing it properly and nicely would require a major rewrite that would cause more trouble*/}
      {!isCollapsed && (
        <div style={{ position: 'relative' }}>
          <Box
            direction="Row"
            justifyContent={compact ? 'SpaceAround' : 'SpaceBetween'}
            alignItems="Center"
            className={css.UserQuickTools}
            style={
              compact
                ? {
                    borderTopLeftRadius: config.radii.R500,
                    borderTopRightRadius: config.radii.R500,
                    width: '100vw',
                  }
                : {
                    opacity: isResizingSidebar ? '0%' : '100%',
                    transition: isResizingSidebar ? 'opacity 0.2s ease' : 'opacity 0.5s ease',
                    width: toRem(width ?? 100),
                    position: 'absolute',
                    left: toRem(-66),
                  }
            }
          >
            {compact ? (
              <>
                <MessageTab isBottom isMobile />
                <InboxTab isBottom isMobile />
                <NavigateTab isBottom isMobile />
                <UserMenuTab isBottom isMobile />
              </>
            ) : (
              <>
                <UserMenuTab isBottom />
                <Box
                  style={{
                    gap: config.space.S300,
                  }}
                >
                  {!isCollapsed && (
                    <>
                      <InboxTab isBottom />
                      <NavigateTab isBottom />
                      <SettingsTab isBottom />
                    </>
                  )}
                </Box>
              </>
            )}
          </Box>
        </div>
      )}
    </>
  );
}
