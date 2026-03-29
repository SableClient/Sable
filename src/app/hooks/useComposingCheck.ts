import { useCallback, useEffect } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { lastCompositionEndAtom } from '$state/lastCompositionEnd';

type TimeStamped = {
  readonly timeStamp: number;
};

export function useCompositionEndTracking(): void {
  const setLastCompositionEnd = useSetAtom(lastCompositionEndAtom);

  const recordCompositionEnd = useCallback(
    (evt: TimeStamped) => {
      setLastCompositionEnd(evt.timeStamp);
    },
    [setLastCompositionEnd]
  );

  useEffect(() => {
    window.addEventListener('compositionend', recordCompositionEnd, { capture: true });
    return () => {
      window.removeEventListener('compositionend', recordCompositionEnd, { capture: true });
    };
  });
}

type IsComposingLike = {
  readonly timeStamp: number;
  readonly keyCode: number;
  readonly nativeEvent: {
    readonly isComposing?: boolean;
  };
};

export function useComposingCheck({
  compositionEndThreshold = 500,
}: { compositionEndThreshold?: number } = {}): (evt: IsComposingLike) => boolean {
  const compositionEnd = useAtomValue(lastCompositionEndAtom);
  return useCallback(
    (evt: IsComposingLike): boolean =>
      evt.nativeEvent.isComposing ||
      (evt.keyCode === 229 &&
        typeof compositionEnd !== 'undefined' &&
        evt.timeStamp - compositionEnd < compositionEndThreshold),
    [compositionEndThreshold, compositionEnd]
  );
}
