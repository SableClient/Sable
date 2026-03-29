export function generateShortId(length: number): string {
  const uuid = crypto.randomUUID();
  return uuid.replaceAll('-', '').substring(0, length);
}
