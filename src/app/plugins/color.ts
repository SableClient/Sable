import chroma from 'chroma-js';
import { ThemeKind } from '$hooks/useTheme';

const clampColor = (
  lightness: number,
  lightCap: number,
  darkCap: number,
  themeKind: ThemeKind
): number => {
  if (themeKind === ThemeKind.Dark && lightness < darkCap) {
    lightness = darkCap;
  }
  if (themeKind === ThemeKind.Light && lightness > lightCap) {
    lightness = lightCap;
  }
  return lightness;
};

export const accessibleColor = (themeKind: ThemeKind, color: string): string => {
  if (!chroma.valid(color)) return color;

  let lightness = chroma(color).lab()[0];
  lightness = clampColor(lightness, 50, 60, themeKind);

  return chroma(color).set('lab.l', lightness).hex();
};

export const accessibleColorWeakCorrection = (themeKind: ThemeKind, color: string): string => {
  if (!chroma.valid(color)) return color;

  let lightness = chroma(color).lab()[0];
  lightness = clampColor(lightness, 70, 40, themeKind);

  return chroma(color).set('lab.l', lightness).hex();
};
