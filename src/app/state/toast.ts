import { useSyncExternalStore } from 'react';

export type ToastMessage = { id: number; text: string };

let current: ToastMessage | null = null;
let counter = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

const notify = (): void => {
  listeners.forEach((listener) => listener());
};

export const showToast = (text: string, durationMs = 3000): void => {
  counter += 1;
  current = { id: counter, text };
  notify();

  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    timer = undefined;
    notify();
  }, durationMs);
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = (): ToastMessage | null => current;

export const useToastMessage = (): ToastMessage | null =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
