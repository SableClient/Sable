import { describe, expect, it } from 'vitest';

import type { Persona } from './index';
import { resolvePersonaProxy } from './proxy';

describe('resolvePersonaProxy', () => {
  const persona: Persona = {
    id: 'persona',
    displayname: 'Persona',
    trigger: {
      prefix: ['p: '],
      'net.f0rest.suffix': [' :p'],
      'net.f0rest.circumfix': [{ prefix: '[', suffix: ']' }],
    },
  };

  it('strips prefix, suffix, and circumfix triggers', () => {
    expect(resolvePersonaProxy([persona], 'p: hello')?.body).toBe('hello');
    expect(resolvePersonaProxy([persona], 'hello :p')?.body).toBe('hello');
    expect(resolvePersonaProxy([persona], '[hello]')?.body).toBe('hello');
  });
});
