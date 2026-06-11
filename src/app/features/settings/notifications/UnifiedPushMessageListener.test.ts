import { describe, expect, it, vi } from 'vitest';
import { createUnifiedPushMessageListener } from './UnifiedPushMessageListener';

describe('createUnifiedPushMessageListener', () => {
  it('catches rejected payload handlers instead of leaking unhandled rejections', async () => {
    const onError = vi.fn();
    const listener = createUnifiedPushMessageListener(async () => {
      throw new Error('boom');
    }, onError);

    expect(listener({})).toBeUndefined();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
  });
});
