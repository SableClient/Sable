import { describe, expect, it, vi } from 'vitest';
import { onTabPress } from './keyboard';

describe('onTabPress', () => {
  it('does not trigger when the tab event was already handled', () => {
    const callback = vi.fn<() => void>();
    const preventDefault = vi.fn<() => void>();

    onTabPress(
      {
        key: 'Tab',
        which: 9,
        altKey: false,
        ctrlKey: false,
        defaultPrevented: true,
        metaKey: false,
        shiftKey: false,
        preventDefault,
      },
      callback
    );

    expect(callback).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
