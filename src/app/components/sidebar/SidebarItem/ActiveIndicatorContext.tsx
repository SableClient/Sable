import { createContext, ReactNode, useCallback, useContext, useEffect, useRef } from 'react';

type Listener = () => void;

type ActiveIndicatorContextType = {
  register: (el: HTMLElement) => void;
  unregister: (el: HTMLElement) => void;
  subscribe: (listener: Listener) => () => void;
  getActiveElement: () => HTMLElement | null;
};

const ActiveIndicatorContext = createContext<ActiveIndicatorContextType | null>(null);

export function ActiveIndicatorProvider({ children }: { children: ReactNode }) {
  const activeStackRef = useRef<HTMLElement[]>([]);
  const listenersRef = useRef<Set<Listener>>(new Set());

  const notify = useCallback(() => {
    listenersRef.current.forEach((l) => l());
  }, []);

  const register = useCallback(
    (el: HTMLElement) => {
      activeStackRef.current = activeStackRef.current.filter((e) => e !== el);
      activeStackRef.current.push(el);
      notify();
    },
    [notify]
  );

  const unregister = useCallback(
    (el: HTMLElement) => {
      activeStackRef.current = activeStackRef.current.filter((e) => e !== el);
      notify();
    },
    [notify]
  );

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const getActiveElement = useCallback(
    () => activeStackRef.current[activeStackRef.current.length - 1] ?? null,
    []
  );

  return (
    <ActiveIndicatorContext.Provider value={{ register, unregister, subscribe, getActiveElement }}>
      {children}
    </ActiveIndicatorContext.Provider>
  );
}

export function useActiveIndicator() {
  return useContext(ActiveIndicatorContext);
}

export function useRegisterActive(active: boolean) {
  const ctx = useActiveIndicator();
  const elRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el || !ctx) return;

    if (active) {
      ctx.register(el);
    } else {
      ctx.unregister(el);
    }

    return () => {
      ctx.unregister(el);
    };
  }, [active, ctx]);

  return elRef;
}
