import { useCallback } from 'react';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { accessibleColor, accessibleColorWeakCorrection } from '$plugins/color';
import type { ThemeKind } from './useTheme';

export const useAccessibleNameColor = (themeKind: ThemeKind) => {
  const [nameColorLightnessCorrection] = useSetting(settingsAtom, 'nameColorLightnessCorrection');

  return useCallback(
    (color: string | undefined) => {
      if (!color || nameColorLightnessCorrection === 'off') {
        return color;
      }
      return nameColorLightnessCorrection === 'strong'
        ? accessibleColor(themeKind, color)
        : accessibleColorWeakCorrection(themeKind, color);
    },
    [nameColorLightnessCorrection, themeKind]
  );
};
