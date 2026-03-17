// https://github.com/cloudrac3r/cadencegq/blob/master/pug/mxid.pug

function hashCode(str?: string): number {
  let hash = 0;
  if (str === undefined || str.length === 0) {
    return hash;
  }
  for (let i = 0; i < str.length; i += 1) {
    const chr = str.codePointAt(i) ?? 0;
    // eslint-disable-next-line no-bitwise
    hash = (hash << 5) - hash + chr;

    hash = Math.trunc(hash);
  }
  return Math.abs(hash);
}

export function cssColorMXID(userId?: string): string {
  const colorNumber = hashCode(userId) % 8;
  return `--mx-uc-${colorNumber + 1}`;
}

export default function colorMXID(userId?: string): string {
  const hash = hashCode(userId);

  const h = hash % 360;
  const s = 65;
  const l = 80;

  return `hsl(${h}, ${s}%, ${l}%)`;
}
