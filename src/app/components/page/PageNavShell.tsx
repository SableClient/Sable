import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { Box, toRem } from 'folds';
import { PageNav } from '$components/page';
import { SidebarResizer } from '$pages/client/sidebar/SidebarResizer';
import { UserQuickTools } from '$pages/client/sidebar/UserQuickTools';

type PageNavShellProps = {
  header: ReactNode;
  children: ReactNode;
  curWidth: number;
  setCurWidth: Dispatch<SetStateAction<number>>;
  roomSidebarWidth: number;
  setRoomSidebarWidth: (width: number) => void;
  setIsResizingSidebar: (is: boolean) => void;
  isMobile: boolean;
  oldSidebar: boolean;
};

export function PageNavShell({
  header,
  children,
  curWidth,
  setCurWidth,
  roomSidebarWidth,
  setRoomSidebarWidth,
  setIsResizingSidebar,
  isMobile,
  oldSidebar,
}: PageNavShellProps) {
  return (
    <Box
      shrink="No"
      style={{
        position: 'relative',
        width: isMobile ? '100%' : toRem(curWidth),
      }}
    >
      <PageNav>
        {header}
        {children}
      </PageNav>
      {!isMobile && (
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
      )}
      {!oldSidebar && !isMobile && <UserQuickTools width={curWidth + 66} compact={false} />}
    </Box>
  );
}
