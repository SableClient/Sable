import { describe, expect, it } from 'vitest';

import type { Persona } from './index';
import { resolvePersonaProxy } from './proxy';

describe('resolvePersonaProxy', () => {
  const persona: Persona = {
    id: 'persona',
    displayname: 'Persona',
    triggers: [
      { prefix: 'r: ' },
      { suffix: ' :r' },
      { prefix: '[', suffix: ']', keep_trigger: false },
      { prefix: 'd: ', keep_trigger: true },
      { suffix: ' :d', keep_trigger: true },
      { prefix: '<', suffix: '>', keep_trigger: true },
    ],
  };

  it('strips prefix, suffix, and circumfix triggers', () => {
    expect(resolvePersonaProxy([persona], 'r: hello')?.body).toBe('hello');
    expect(resolvePersonaProxy([persona], 'hello :r')?.body).toBe('hello');
    expect(resolvePersonaProxy([persona], '[hello]')?.body).toBe('hello');
    expect(resolvePersonaProxy([persona], 'd: hello')?.body).toBe('d: hello');
    expect(resolvePersonaProxy([persona], 'hello :d')?.body).toBe('hello :d');
    expect(resolvePersonaProxy([persona], '<hello>')?.body).toBe('<hello>');
  });
});
