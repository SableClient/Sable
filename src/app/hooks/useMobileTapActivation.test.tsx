import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useMobileTapActivation } from './useMobileTapActivation';

function TapCloseHarness({ onUnderlyingClick }: { onUnderlyingClick: () => void }) {
  const [open, setOpen] = useState(true);
  const activation = useMobileTapActivation(true, () => setOpen(false));

  return (
    <>
      {open && (
        <button type="button" data-testid="close" {...activation}>
          Close
        </button>
      )}
      <button type="button" data-testid="underlying" onClick={onUnderlyingClick}>
        Underlying
      </button>
    </>
  );
}

describe('useMobileTapActivation', () => {
  it('swallows a synthetic click retargeted after activation unmounts its control', () => {
    const onUnderlyingClick = vi.fn<() => void>();
    render(<TapCloseHarness onUnderlyingClick={onUnderlyingClick} />);

    const close = screen.getByTestId('close');
    fireEvent.pointerDown(close, {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(close, {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.click(screen.getByTestId('underlying'), { clientX: 10, clientY: 10 });

    expect(screen.queryByTestId('close')).not.toBeInTheDocument();
    expect(onUnderlyingClick).not.toHaveBeenCalled();
  });

  it('does not swallow a genuine second tap at the same spot', () => {
    const onUnderlyingClick = vi.fn<() => void>();
    render(<TapCloseHarness onUnderlyingClick={onUnderlyingClick} />);

    const close = screen.getByTestId('close');
    fireEvent.pointerDown(close, {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(close, {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: 10,
      clientY: 10,
    });

    const underlying = screen.getByTestId('underlying');
    fireEvent.pointerDown(underlying, {
      pointerId: 2,
      pointerType: 'touch',
      isPrimary: true,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.click(underlying, { clientX: 10, clientY: 10 });

    expect(onUnderlyingClick).toHaveBeenCalledOnce();
  });
});
