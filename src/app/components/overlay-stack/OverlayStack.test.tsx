import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OVERLAY_LAYER_BASE } from './layers';
import { OverlayStackProvider, useOverlayLayer } from './OverlayStack';

function Layer({ name, children }: { name: string; children?: React.ReactNode }) {
  const zIndex = useOverlayLayer();

  return (
    <div data-testid={name} data-z={zIndex}>
      {children}
    </div>
  );
}

const layerOf = (name: string) => Number(screen.getByTestId(name).dataset.z);

/** `toggled` sits before `steady` in the tree, so tree order and open order disagree. */
function Host({ toggled, steady, initiallyShown }: ToggleHostProps) {
  const [shown, setShown] = useState(initiallyShown);

  return (
    <>
      <button type="button" onClick={() => setShown(!initiallyShown)}>
        toggle
      </button>
      {shown && <Layer name={toggled} />}
      <Layer name={steady} />
    </>
  );
}

type ToggleHostProps = { toggled: string; steady: string; initiallyShown: boolean };

const toggle = () => act(() => screen.getByRole('button').click());

describe('useOverlayLayer', () => {
  it('puts an overlay opened from inside another above it', () => {
    render(
      <OverlayStackProvider>
        <Layer name="outer">
          <Layer name="inner" />
        </Layer>
      </OverlayStackProvider>
    );

    expect(layerOf('inner')).toBeGreaterThan(layerOf('outer'));
  });

  it('orders by open order, not by tree position', () => {
    render(
      <OverlayStackProvider>
        <Host toggled="second" steady="first" initiallyShown={false} />
      </OverlayStackProvider>
    );
    toggle();

    expect(layerOf('second')).toBeGreaterThan(layerOf('first'));
  });

  it('frees the layer again when an overlay closes', () => {
    render(
      <OverlayStackProvider>
        <Host toggled="transient" steady="kept" initiallyShown />
      </OverlayStackProvider>
    );

    const before = layerOf('kept');
    toggle();

    expect(layerOf('kept')).toBeLessThan(before);
  });

  it('falls back to the base layer outside a provider', () => {
    render(<Layer name="lone" />);

    expect(layerOf('lone')).toBe(OVERLAY_LAYER_BASE);
  });
});
