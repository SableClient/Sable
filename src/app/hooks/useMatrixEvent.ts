import { useEffect } from 'react';

/**
 * Subscribes to an event on a Matrix SDK emitter and auto-cleans up.
 * Replaces hand-rolled `emitter.on(event, handler)` + `return () => emitter.removeListener(event, handler)` in useEffect.
 */
// oxlint-disable typescript/no-explicit-any
export function useMatrixEvent(
  emitter:
    | {
        on: (event: any, handler: (...args: any[]) => void) => any;
        removeListener: (event: any, handler: (...args: any[]) => void) => any;
      }
    | undefined
    | null,
  eventName: string,
  handler: (...args: any[]) => void
): void {
  useEffect(() => {
    if (!emitter) return undefined;
    emitter.on(eventName, handler);
    return () => emitter.removeListener(eventName, handler);
  }, [emitter, eventName, handler]);
}
