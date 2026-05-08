// The disable is because the position should only update whenever the new one is updated
// oxlint-disable eslint-plugin-react-hooks/exhaustive-deps
import { Box } from 'folds';
import * as css from '$pages/client/sidebar/SidebarResizer.css';
import type { Dispatch, SetStateAction } from 'react';
import React, { useCallback, useEffect, useState } from 'react';

export function SidebarResizer({
  sidebarWidth,
  setSidebarWidth,
  setCurWidth,
  rightSided,
  topSided,
}: {
  sidebarWidth: number;
  setSidebarWidth: (arg0: number) => void;
  setCurWidth?: Dispatch<SetStateAction<number>>;
  rightSided?: boolean;
  topSided?: boolean;
}) {
  const [isPointerOver, setIsPointerOver] = useState(false);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [oldX, setOldX] = useState(0);
  const [interimX, setInterimX] = useState(0);
  const [newX, setNewX] = useState(0);

  useEffect(() => {
    const change = rightSided ? -(oldX - newX) : oldX - newX;
    if (change) setSidebarWidth(Math.min(Math.max(sidebarWidth - change, 0), 1200));
  }, [newX]);

  useEffect(() => {
    const change = rightSided ? -(oldX - interimX) : oldX - interimX;
    if (change && setCurWidth) setCurWidth(Math.min(Math.max(sidebarWidth - change, 0), 1200));
  }, [interimX]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    e.preventDefault();
    setInterimX(topSided ? e.clientY : e.clientX);
  }, []);
  const onPointerUp = useCallback((e: PointerEvent) => {
    e.preventDefault();
    setNewX(topSided ? e.clientY : e.clientX);
    setIsPointerDown(false);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointermove', onPointerMove);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setOldX(topSided ? e.clientY : e.clientX);
      setIsPointerDown(true);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointermove', onPointerMove);
    },
    [onPointerUp, onPointerMove]
  );

  return (
    <Box
      className={`${css.SidebarResizer} ${isPointerOver || isPointerDown ? css.SidebarResizerHover : ''}`}
      onPointerEnter={() => setIsPointerOver(true)}
      onPointerLeave={() => setIsPointerOver(false)}
      onPointerDown={onPointerDown}
      style={{
        width: topSided ? '100%' : '4px',
        height: topSided ? '4px' : '100%',
      }}
    >
      <Box
        className={css.SideBarResizerAnimation}
        style={{ height: isPointerOver || isPointerDown ? '100%' : '0px' }}
      />
    </Box>
  );
}
