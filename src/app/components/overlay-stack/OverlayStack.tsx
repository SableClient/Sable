import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { OVERLAY_LAYER_BASE } from './layers';

type Claim = { id: string; seq: number };

type OverlayStackActions = {
  nextSeq: () => number;
  claim: (id: string, seq: number) => void;
  release: (id: string) => void;
};

const EMPTY_CLAIMS: readonly Claim[] = [];

// Claims are kept apart from the actions so that taking a layer cannot invalidate
// the effect that took it, which would release and re-claim on every change.
const OverlayStackActionsContext = createContext<OverlayStackActions | null>(null);
const OverlayStackClaimsContext = createContext<readonly Claim[]>(EMPTY_CLAIMS);

export function OverlayStackProvider({ children }: { children: ReactNode }) {
  const [claims, setClaims] = useState<readonly Claim[]>(EMPTY_CLAIMS);
  const seqRef = useRef(0);

  const actions = useMemo<OverlayStackActions>(
    () => ({
      nextSeq: () => {
        seqRef.current += 1;
        return seqRef.current;
      },
      claim: (id, seq) =>
        setClaims((prev) =>
          prev.some((claim) => claim.id === id)
            ? prev
            : [...prev, { id, seq }].toSorted((a, b) => a.seq - b.seq)
        ),
      release: (id) => setClaims((prev) => prev.filter((claim) => claim.id !== id)),
    }),
    []
  );

  return (
    <OverlayStackActionsContext.Provider value={actions}>
      <OverlayStackClaimsContext.Provider value={claims}>
        {children}
      </OverlayStackClaimsContext.Provider>
    </OverlayStackActionsContext.Provider>
  );
}

/**
 * Reserves a layer for as long as `active` holds, and returns the z-index that
 * keeps it above every overlay opened before it. Stacking follows open order
 * rather than component identity, so no overlay has to know the others exist.
 */
export function useOverlayLayer(active = true): number {
  const id = useId();
  const actions = useContext(OverlayStackActionsContext);
  const claims = useContext(OverlayStackClaimsContext);
  const seqRef = useRef<number | null>(null);

  // Taken during render, which runs a parent before its children, so an overlay
  // opened from inside another sorts above it. Effects run child-first and would
  // invert exactly that case. Dropping it while closed lets a reopen go back on top.
  if (!active) seqRef.current = null;
  else if (seqRef.current === null && actions) seqRef.current = actions.nextSeq();
  const seq = seqRef.current;

  useEffect(() => {
    if (!actions || !active || seq === null) return undefined;
    actions.claim(id, seq);
    return () => actions.release(id);
  }, [actions, active, id, seq]);

  // The claim lands in an effect, so the first paint has no place in the stack yet.
  const claimed = claims.findIndex((claim) => claim.id === id);
  return OVERLAY_LAYER_BASE + (claimed === -1 ? claims.length : claimed);
}
