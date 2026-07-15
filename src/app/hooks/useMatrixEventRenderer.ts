import { useCallback, useRef } from 'react';
import type { ReactNode } from 'react';

export type EventRenderer<T extends unknown[]> = (...args: T) => ReactNode;

export type EventRendererOpts<T extends unknown[]> = Record<string, EventRenderer<T>>;

export type RenderMatrixEvent<T extends unknown[]> = (
  eventType: string,
  isStateEvent: boolean,
  ...args: T
) => ReactNode;

export const useMatrixEventRenderer = <T extends unknown[]>(
  typeToRenderer: EventRendererOpts<T>,
  renderStateEvent?: EventRenderer<T>,
  renderEvent?: EventRenderer<T>
): RenderMatrixEvent<T> => {
  const latestRef = useRef({ typeToRenderer, renderStateEvent, renderEvent });

  latestRef.current = { typeToRenderer, renderStateEvent, renderEvent };

  return useCallback((eventType: string, isStateEvent: boolean, ...args: T) => {
    const renderer = latestRef.current.typeToRenderer[eventType];
    if (renderer) return renderer(...args);

    if (isStateEvent && latestRef.current.renderStateEvent) {
      return latestRef.current.renderStateEvent(...args);
    }

    if (!isStateEvent && latestRef.current.renderEvent) {
      return latestRef.current.renderEvent(...args);
    }
    return null;
  }, []);
};
