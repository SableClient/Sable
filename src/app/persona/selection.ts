import type { Persona, ResolvedPersonaSelection } from './index';

export function resolvePersona({
  proxy,
  latched,
  room,
  account,
  now,
}: {
  proxy?: Persona;
  latched?: Persona;
  room?: ResolvedPersonaSelection;
  account?: ResolvedPersonaSelection;
  now: number;
}): Persona | undefined {
  if (proxy) return proxy;
  if (latched) return latched;
  if (room && (room.validUntil === undefined || room.validUntil > now)) return room.persona;
  if (account && (account.validUntil === undefined || account.validUntil > now))
    return account.persona;
  return undefined;
}
