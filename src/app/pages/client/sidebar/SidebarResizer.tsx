import { Box } from 'folds';
import * as css from '$pages/client/sidebar/SidebarResizer.css';
import type { SetStateAction } from 'react';
import React, { useCallback, useEffect, useState } from 'react';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';

export function SidebarResizer() {
  const [roomSidebarWidth, setRoomSidebarWidth] = useSetting(settingsAtom, 'roomSidebarWidth');

  const [isPointerOver, setIsPointerOver] = useState(false);
  const [oldX, setOldX] = useState(0);
  const [newX, setNewX] = useState(0);

  useEffect(() => {
    const change = oldX - newX;
    if (change) setRoomSidebarWidth(Math.max(roomSidebarWidth - change, 0));
    // The disable is because the position should only update whenever the new one is updated
    // oxlint-disable-next-line eslint-plugin-react-hooks/exhaustive-deps
  }, [newX]);
  const onMouseUp = useCallback((e: { clientX: SetStateAction<number> }) => {
    setNewX(e.clientX);
    window.removeEventListener('pointerup', onMouseUp);
  }, []);

  const onMouseDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setOldX(e.clientX);
      window.addEventListener('pointerup', onMouseUp);
    },
    [onMouseUp]
  );

  return (
    <Box
      className={css.SidebarResizer}
      onPointerEnter={() => setIsPointerOver(true)}
      onPointerLeave={() => setIsPointerOver(false)}
      onPointerDown={onMouseDown}
      onPointerUp={onMouseUp}
    >
      <Box
        className={css.SideBarResizerAnimation}
        style={{ height: isPointerOver ? '100%' : '0px' }}
      />
    </Box>
  );
}
