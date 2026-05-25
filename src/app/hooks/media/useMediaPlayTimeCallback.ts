import { useEffect } from 'react';

export type PlayTimeCallback = (duration: number, currentTime: number) => void;

export const useMediaPlayTimeCallback = (
  getTargetElement: () => HTMLMediaElement | null,
  onPlayTimeCallback: PlayTimeCallback
): void => {
  useEffect(() => {
    const targetEl = getTargetElement();
    const handleChange = () => {
      if (!targetEl) return;
      const { duration, currentTime } = targetEl;
      onPlayTimeCallback(
        duration,
        Number.isFinite(currentTime) && currentTime >= 0 ? currentTime : 0
      );
    };
    targetEl?.addEventListener('timeupdate', handleChange);
    targetEl?.addEventListener('loadedmetadata', handleChange);
    targetEl?.addEventListener('ended', handleChange);
    return () => {
      targetEl?.removeEventListener('timeupdate', handleChange);
      targetEl?.removeEventListener('loadedmetadata', handleChange);
      targetEl?.removeEventListener('ended', handleChange);
    };
  }, [getTargetElement, onPlayTimeCallback]);
};
