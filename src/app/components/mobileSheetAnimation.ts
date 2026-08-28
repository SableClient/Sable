import { useEffect, useState } from 'react';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { MOBILE_SHEET_DURATION_MS, MOBILE_SHEET_EASING } from './mobileSheetAnimationConstants';

export const getMobileSheetTiming = (reducedMotion: boolean): KeyframeAnimationOptions => ({
  duration: reducedMotion ? 0 : MOBILE_SHEET_DURATION_MS,
  easing: MOBILE_SHEET_EASING,
  fill: 'forwards',
});

export function useMobileSheetAnimation() {
  const [reducedMotion] = useSetting(settingsAtom, 'reducedMotion');
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    const handleChange = () => setPrefersReducedMotion(query.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  return {
    shouldReduceMotion: reducedMotion || prefersReducedMotion,
  };
}
