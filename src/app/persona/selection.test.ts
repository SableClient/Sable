import { describe, expect, it } from 'vitest';

import type { Persona } from './index';
import { resolvePersona } from './selection';

const persona = (id: string): Persona => ({ id, displayname: id });

describe('resolvePersona', () => {
  it('uses proxy, latched, room, then account precedence', () => {
    const proxy = persona('proxy');
    const latched = persona('latched');
    const room = persona('room');
    const account = persona('account');

    expect(
      resolvePersona({
        proxy,
        latched,
        room: { persona: room },
        account: { persona: account },
        now: 1,
      })
    ).toBe(proxy);
    expect(
      resolvePersona({ latched, room: { persona: room }, account: { persona: account }, now: 1 })
    ).toBe(latched);
    expect(resolvePersona({ room: { persona: room }, account: { persona: account }, now: 1 })).toBe(
      room
    );
  });

  it('ignores expired selections', () => {
    const account = persona('account');
    expect(
      resolvePersona({
        room: { persona: persona('room'), validUntil: 1 },
        account: { persona: account },
        now: 1,
      })
    ).toBe(account);
  });
});
