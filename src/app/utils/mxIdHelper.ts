export const matchMxId = (id: string): RegExpMatchArray | null =>
  id.match(/^([@$+#])([^\s:]+):(\S+)$/);
export const validMxId = (id: string): boolean => !!matchMxId(id);
export const getMxIdServer = (userId: string): string | undefined => matchMxId(userId)?.[3];
