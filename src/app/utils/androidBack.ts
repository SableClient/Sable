import { useEffect, useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';

// Returns true if it consumed the back event (e.g. closed an overlay).
export type AndroidBackHandler = () => boolean;

const handlers: AndroidBackHandler[] = [];

function pushAndroidBackHandler(handler: AndroidBackHandler): () => void {
  handlers.push(handler);
  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index !== -1) handlers.splice(index, 1);
  };
}

function routerBack(): boolean {
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  if (idx > 0) {
    window.history.back();
    return true;
  }
  return false;
}

function runAndroidBack(): boolean {
  for (let i = handlers.length - 1; i >= 0; i -= 1) {
    if (handlers[i]?.()) return true;
  }
  return routerBack();
}

declare global {
  interface Window {
    __sableAndroidBack?: () => boolean;
  }
}

export function installAndroidBackBridge(): void {
  if (!isTauri() || osType() !== 'android') return;
  window.__sableAndroidBack = runAndroidBack;
}

export function useAndroidBackHandler(handler: AndroidBackHandler, enabled = true): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;
    return pushAndroidBackHandler(() => handlerRef.current());
  }, [enabled]);
}

/**
 * Registers an Android back handler that dismisses the overlay it's bound to.
 * Returns true so the back event is consumed instead of falling through to
 * the underlying route. Mirrors the Escape-key / tap-outside dismiss path
 * by calling `requestClose`.
 *
 * For always-mounted components that toggle open via state, pass `enabled`
 * (e.g. the open state) so the handler only consumes back while the overlay
 * is actually showing.
 */
export function useDismissOnBack(requestClose: () => void, enabled = true): void {
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  useAndroidBackHandler(() => {
    requestCloseRef.current();
    return true;
  }, enabled);
}
