import { ComponentProps, useEffect, useRef, useState } from 'react';
import { subscribeToLivePointer, unsubscribeFromLivePointer } from '$utils/livePointerTracker';

type BackgroundGlowProps = ComponentProps<'div'> & {
  color: string;
};

export function BackgroundGlow({ color, style, ...props }: BackgroundGlowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const internalGlowRef = useRef<HTMLDivElement>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefersReducedMotion(media.matches);

    update();
    media.addEventListener('change', update);

    return () => {
      media.removeEventListener('change', update);
    };
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) return undefined;

    const handlePointer = (x: number, y: number) => {
      if (!internalGlowRef.current) return;
      const parentRect = containerRef.current?.getBoundingClientRect();
      if (!parentRect) return;
      internalGlowRef.current.style.left = `${x - parentRect.left}px`;
      internalGlowRef.current.style.top = `${y - parentRect.top}px`;
    };

    subscribeToLivePointer(handlePointer);

    return () => {
      unsubscribeFromLivePointer(handlePointer);
    };
  }, [prefersReducedMotion]);

  if (prefersReducedMotion) {
    return null;
  }

  return (
    <div
      {...props}
      ref={containerRef}
      style={{
        position: 'relative',
        overflow: 'hidden',
        pointerEvents: 'none',
        ...style,
      }}
    >
      <div
        ref={internalGlowRef}
        style={{
          position: 'absolute',
          transform: 'translate(-50%, -50%)',
          width: '200%',
          aspectRatio: '1 / 2',
          background: `radial-gradient(circle closest-side at center, ${color} 0%, rgba(0, 0, 0, 0) 100%)`,
        }}
      />
    </div>
  );
}
