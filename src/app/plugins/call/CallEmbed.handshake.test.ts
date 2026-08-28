import { describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/debugLogger', () => ({
  createDebugLogger: () => ({
    info: vi.fn<(...args: unknown[]) => void>(),
    warn: vi.fn<(...args: unknown[]) => void>(),
    error: vi.fn<(...args: unknown[]) => void>(),
    debug: vi.fn<(...args: unknown[]) => void>(),
  }),
}));

import { CallEmbed } from './CallEmbed';

describe('CallEmbed.getIframe', () => {
  it('leaves src unset so the caller can load after the transport is listening', () => {
    const iframe = CallEmbed.getIframe();

    expect(iframe.getAttribute('src')).toBeNull();
  });
});
