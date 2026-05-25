import { useCallback, useEffect, useState } from 'react';

export type MediaPlayData = {
  playing: boolean;
};

export type MediaPlayControl = {
  setPlaying: (play: boolean) => void;
};

export const useMediaPlay = (
  getTargetElement: () => HTMLMediaElement | null
): MediaPlayData & MediaPlayControl => {
  const [playing, setPlay] = useState(false);

  const setPlaying = useCallback(
    (play: boolean) => {
      const targetEl = getTargetElement();
      if (!targetEl) return;
      if (play) {
        // Browsers block autoplay without a prior user gesture — catch NotAllowedError
        targetEl.play().catch((err: Error) => {
          if (err.name === 'NotAllowedError') {
            // Silently ignore autoplay blocking — user must manually start playback
            return;
          }
          // Re-throw other errors (e.g., network, decoding issues)
          throw err;
        });
      } else {
        targetEl.pause();
      }
    },
    [getTargetElement]
  );

  useEffect(() => {
    const targetEl = getTargetElement();
    const handleChange = () => {
      if (!targetEl) return;
      setPlay(!targetEl.paused);
    };
    targetEl?.addEventListener('playing', handleChange);
    targetEl?.addEventListener('play', handleChange);
    targetEl?.addEventListener('pause', handleChange);
    return () => {
      targetEl?.removeEventListener('playing', handleChange);
      targetEl?.removeEventListener('play', handleChange);
      targetEl?.removeEventListener('pause', handleChange);
    };
  }, [getTargetElement]);

  return {
    playing,
    setPlaying,
  };
};
