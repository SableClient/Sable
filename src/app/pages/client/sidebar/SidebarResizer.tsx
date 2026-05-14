// The disable is because the position should only update whenever the new one is updated
// oxlint-disable eslint-plugin-react-hooks/exhaustive-deps
import { Box, toRem } from 'folds';
import * as css from '$pages/client/sidebar/SidebarResizer.css';
import type { Dispatch, SetStateAction } from 'react';
import React, { useCallback, useEffect, useState } from 'react';

export function SidebarResizer({
  sidebarWidth,
  setSidebarWidth,
  setCurWidth,
  minValue,
  maxValue,
  instep,
  outstep,
  isReversed,
  topSided,
}: {
  sidebarWidth: number;
  setSidebarWidth: (arg0: number) => void;
  setCurWidth?: Dispatch<SetStateAction<number>>;
  minValue: number;
  maxValue: number;
  instep?: number;
  outstep?: number;
  isReversed?: boolean;
  topSided?: boolean;
}) {
  const [isPointerOver, setIsPointerOver] = useState(false);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [oldPos, setOldPos] = useState(0);
  const [interimPos, setInterimPos] = useState(0);
  const [newPos, setNewPos] = useState(0);

  useEffect(() => {
    const change = isReversed ? -(oldPos - newPos) : oldPos - newPos;
    let newValue = Math.min(Math.max(sidebarWidth - change, minValue), maxValue);
    if (instep && outstep && newValue > instep && newValue < outstep)
      newValue = newValue > (instep + outstep) / 2 ? outstep : instep;

    if (change) setSidebarWidth(newValue);
  }, [newPos]);

  useEffect(() => {
    const change = isReversed ? -(oldPos - interimPos) : oldPos - interimPos;
    let newValue = Math.min(Math.max(sidebarWidth - change, minValue), maxValue);
    if (instep && outstep && newValue > instep && newValue < outstep)
      newValue = newValue > (instep + outstep) / 2 ? outstep : instep;
    if (change && setCurWidth) setCurWidth(newValue);
  }, [interimPos]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    e.preventDefault();
    setInterimPos(topSided ? e.clientY : e.clientX);
  }, []);
  const onPointerUp = useCallback((e: PointerEvent) => {
    e.preventDefault();
    setNewPos(topSided ? e.clientY : e.clientX);
    setIsPointerDown(false);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointermove', onPointerMove);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setOldPos(topSided ? e.clientY : e.clientX);
      setIsPointerDown(true);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointermove', onPointerMove);
    },
    [onPointerUp, onPointerMove]
  );

  const dockClass = topSided
    ? css.SidebarResizerDockTop
    : isReversed
      ? css.SidebarResizerDockLeft
      : css.SidebarResizerDockRight;

  return (
    <Box
      className={`${css.SidebarResizer} ${dockClass} ${isPointerOver || isPointerDown ? css.SidebarResizerHover : ''}`}
      onPointerEnter={() => setIsPointerOver(true)}
      onPointerLeave={() => setIsPointerOver(false)}
      onPointerDown={onPointerDown}
      style={{
        width: topSided ? '100%' : toRem(4),
        height: topSided ? toRem(4) : '100%',
      }}
      shrink="No"
    >
      <Box
        shrink="No"
        className={css.SideBarResizerAnimation}
        style={{ opacity: isPointerOver || isPointerDown ? '100%' : '0%' }}
      />
    </Box>
  );
}
