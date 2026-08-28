import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNativePresence } from './useNativePresence';

function Probe({ value }: { value: string | null }) {
  const { displayed, phase } = useNativePresence(value, value ?? undefined, 150);
  return (
    <div data-testid="probe" data-phase={phase}>
      {displayed ?? 'empty'}
    </div>
  );
}

describe('useNativePresence', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps the previous value mounted until its CSS exit duration completes', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Probe value="online" />);

    rerender(<Probe value={null} />);
    expect(screen.getByTestId('probe')).toHaveTextContent('online');
    expect(screen.getByTestId('probe')).toHaveAttribute('data-phase', 'exit');

    act(() => vi.advanceTimersByTime(149));
    expect(screen.getByTestId('probe')).toHaveTextContent('online');

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId('probe')).toHaveTextContent('empty');
  });

  it('waits for the old keyed value to exit before entering the new one', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Probe value="online" />);

    rerender(<Probe value="offline" />);
    expect(screen.getByTestId('probe')).toHaveTextContent('online');
    expect(screen.getByTestId('probe')).toHaveAttribute('data-phase', 'exit');

    act(() => vi.advanceTimersByTime(150));
    expect(screen.getByTestId('probe')).toHaveTextContent('offline');
    expect(screen.getByTestId('probe')).toHaveAttribute('data-phase', 'enter');
  });
});
