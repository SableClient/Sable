import { createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callEmbedAtom, callEmbedStartErrorAtom } from './callEmbed';

const distributionMock = vi.fn<(...args: unknown[]) => void>();

vi.mock('@sentry/react', () => ({
  metrics: {
    distribution: (...args: unknown[]) => distributionMock(...args),
  },
}));

describe('callEmbedAtom', () => {
  beforeEach(() => {
    distributionMock.mockReset();
  });

  it('disposes previous embed when replaced', () => {
    const store = createStore();
    const disposeA = vi.fn<() => void>();
    const disposeB = vi.fn<() => void>();
    const embedA = { dispose: disposeA } as unknown;
    const embedB = { dispose: disposeB } as unknown;

    store.set(callEmbedAtom, embedA as never);
    store.set(callEmbedAtom, embedB as never);

    expect(disposeA).toHaveBeenCalledTimes(1);
    expect(disposeB).not.toHaveBeenCalled();
    expect(distributionMock).toHaveBeenCalledTimes(1);
  });

  it('clears start error when embed is removed', () => {
    const store = createStore();
    const dispose = vi.fn<() => void>();
    const embed = { dispose } as unknown;

    store.set(callEmbedStartErrorAtom, { code: 'prepare_failed', message: 'boom' } as never);
    store.set(callEmbedAtom, embed as never);
    store.set(callEmbedAtom, undefined);

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(store.get(callEmbedStartErrorAtom)).toBeNull();
  });
});
