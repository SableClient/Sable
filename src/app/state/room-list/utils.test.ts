import { describe, expect, it } from 'vitest';
import { applyRoomsAction } from './utils';

describe('applyRoomsAction', () => {
  it('applies a page of room changes in one stable update', () => {
    const current = ['!one:example.com', '!remove:example.com'];

    expect(
      applyRoomsAction(current, {
        type: 'BATCH',
        put: ['!one:example.com', '!two:example.com', '!three:example.com'],
        delete: ['!remove:example.com'],
      })
    ).toEqual(['!one:example.com', '!two:example.com', '!three:example.com']);
  });

  it('preserves the existing array when a batch makes no changes', () => {
    const current = ['!one:example.com'];
    const next = applyRoomsAction(current, {
      type: 'BATCH',
      put: ['!one:example.com'],
      delete: [],
    });

    expect(next).toBe(current);
  });
});
