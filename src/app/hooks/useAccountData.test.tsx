import { renderHook } from '@testing-library/react';
import { EventEmitter } from 'events';
import { describe, expect, it } from 'vitest';
import type { MatrixClient, MatrixEvent } from '$types/matrix-sdk';
import { MatrixClientProvider } from './useMatrixClient';
import { useAccountData } from './useAccountData';

describe('useAccountData', () => {
  it('clears the previous event when the event type changes', () => {
    const mx = Object.assign(new EventEmitter(), {
      getAccountData: (eventType: string) =>
        eventType === 'm.example.one' ? ({ getType: () => eventType } as MatrixEvent) : undefined,
    }) as unknown as MatrixClient;
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MatrixClientProvider value={mx}>{children}</MatrixClientProvider>
    );

    const { result, rerender } = renderHook(({ eventType }) => useAccountData(eventType), {
      initialProps: { eventType: 'm.example.one' },
      wrapper,
    });
    expect(result.current?.getType()).toBe('m.example.one');

    rerender({ eventType: 'm.example.two' });

    expect(result.current).toBeUndefined();
  });
});
