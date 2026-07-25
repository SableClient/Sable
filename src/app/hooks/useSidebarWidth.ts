import { useEffect, useState } from 'react';
import { useSetAtom } from 'jotai';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { isResizingSidebarAtom } from '$state/isResizingSidebar';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';

export function useSidebarWidth() {
  const setIsResizingSidebar = useSetAtom(isResizingSidebarAtom);
  const [roomSidebarWidth, setRoomSidebarWidth] = useSetting(settingsAtom, 'roomSidebarWidth');
  const [curWidth, setCurWidth] = useState(roomSidebarWidth);
  useEffect(() => {
    setCurWidth(roomSidebarWidth);
  }, [roomSidebarWidth]);
  const screenSize = useScreenSizeContext();
  const isMobile = screenSize === ScreenSize.Mobile;
  const hideText = curWidth <= 80 && !isMobile;
  const [oldSidebar] = useSetting(settingsAtom, 'oldSidebar');
  return {
    curWidth,
    setCurWidth,
    roomSidebarWidth,
    setRoomSidebarWidth,
    setIsResizingSidebar,
    isMobile,
    hideText,
    oldSidebar,
  };
}
