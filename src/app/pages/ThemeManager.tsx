import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { configClass, varsClass } from 'folds';
import {
  DarkTheme,
  LightTheme,
  ThemeContextProvider,
  ThemeKind,
  useActiveTheme,
  useSystemThemeKind,
} from '$hooks/useTheme';
import { ArboriumThemeBridge } from '$plugins/arborium';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';

export function UnAuthRouteThemeManager() {
  const systemThemeKind = useSystemThemeKind();

  useEffect(() => {
    document.body.className = '';
    document.body.classList.add(configClass, varsClass);
    if (systemThemeKind === ThemeKind.Dark) {
      document.body.classList.add(...DarkTheme.classNames);
    }
    if (systemThemeKind === ThemeKind.Light) {
      document.body.classList.add(...LightTheme.classNames);
    }
  }, [systemThemeKind]);

  return <ArboriumThemeBridge kind={systemThemeKind} />;
}

export function AuthRouteThemeManager({ children }: { children: ReactNode }) {
  const activeTheme = useActiveTheme();
  const [saturation] = useSetting(settingsAtom, 'saturationLevel');
  const [underlineLinks] = useSetting(settingsAtom, 'underlineLinks');
  const [reducedMotion] = useSetting(settingsAtom, 'reducedMotion');

  useEffect(() => {
    document.body.className = '';
    document.body.classList.add(configClass, varsClass);
    document.body.classList.add(...activeTheme.classNames);

    if (underlineLinks) {
      document.body.classList.add('force-underline-links');
    } else {
      document.body.classList.remove('force-underline-links');
    }

    if (reducedMotion) {
      document.body.classList.add('reduced-motion');
    } else {
      document.body.classList.remove('reduced-motion');
    }

    if (saturation === 0) {
      document.body.style.filter = 'grayscale(1)';
    } else if (saturation && saturation < 100) {
      document.body.style.filter = `saturate(${saturation}%)`;
    } else {
      document.body.style.filter = '';
    }
  }, [activeTheme, saturation, underlineLinks, reducedMotion]);

  return (
    <ArboriumThemeBridge kind={activeTheme.kind}>
      <ThemeContextProvider value={activeTheme}>{children}</ThemeContextProvider>
    </ArboriumThemeBridge>
  );
}
