export function shadeColor(initialColor: string, percent: number) {
  if (!initialColor || initialColor[0] !== '#' || initialColor.length !== 7) return undefined;
  const ratio = 1 + percent / 100;

  // Get hex value, convert it to number, multiply it by the desired amount, then clamp it
  const R = Math.floor(
    Math.max(Math.min(parseInt(initialColor.substring(1, 3), 16) * ratio, 255), 0)
  );
  const G = Math.floor(
    Math.max(Math.min(parseInt(initialColor.substring(3, 5), 16) * ratio, 255), 0)
  );
  const B = Math.floor(
    Math.max(Math.min(parseInt(initialColor.substring(5, 7), 16) * ratio, 255), 0)
  );

  const RR = `${R < 16 ? '0' : ''}${R.toString(16)}`;
  const GG = `${G < 16 ? '0' : ''}${G.toString(16)}`;
  const BB = `${B < 16 ? '0' : ''}${B.toString(16)}`;

  return `#${RR}${GG}${BB}`;
}
