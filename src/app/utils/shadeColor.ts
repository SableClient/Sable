export function shadeColor(initialColor: string, percent: number) {
  if (!initialColor || initialColor[0] !== '#' || initialColor.length !== 7) return undefined;
  const ratio = 1 + percent / 100;

  // Get hex value, convert it to number, multiply it by the desired amount, then clamp it
  let R = Math.min(parseInt(initialColor.substring(1, 3), 16) * ratio, 255);
  let G = Math.min(parseInt(initialColor.substring(3, 5), 16) * ratio, 255);
  let B = Math.min(parseInt(initialColor.substring(5, 7), 16) * ratio, 255);

  if (R <= 8 && G <= 8 && B <= 8 && percent > 0) {
    R = R <= 8 ? Math.max(178 - R, 0) : R;
    G = G <= 8 ? Math.max(178 - G, 0) : G;
    B = B <= 8 ? Math.max(178 - B, 0) : B;
  }

  const RR = Math.floor(R).toString(16).padStart(2, '0');
  const GG = Math.floor(G).toString(16).padStart(2, '0');
  const BB = Math.floor(B).toString(16).padStart(2, '0');

  return `#${RR}${GG}${BB}`;
}

export function isTooDark(color?: string) {
  if (!color) return false;
  const R = parseInt(color.substring(1, 3), 16);
  const G = parseInt(color.substring(3, 5), 16);
  const B = parseInt(color.substring(5, 7), 16);
  return (R + G + B) / 3 < 64;
}

export function isTooBright(color?: string) {
  if (!color) return false;
  const R = parseInt(color.substring(1, 3), 16);
  const G = parseInt(color.substring(3, 5), 16);
  const B = parseInt(color.substring(5, 7), 16);
  return (R + G + B) / 3 > 192;
}
