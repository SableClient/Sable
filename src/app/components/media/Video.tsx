import { VideoHTMLAttributes, forwardRef, useEffect, useRef } from 'react';
import classNames from 'classnames';
import * as css from './media.css';

export const Video = forwardRef<HTMLVideoElement, VideoHTMLAttributes<HTMLVideoElement>>(
  ({ className, ...props }, ref) => (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video className={classNames(css.Video, className)} {...props} ref={ref} />
  )
);

export const MEDIA_VOLUME_KEY = 'mediaVolume';

export function PersistedVolumeVideo({
  onVolumeChange,
  ...props
}: VideoHTMLAttributes<HTMLVideoElement>) {
  const innerRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(MEDIA_VOLUME_KEY);
    if (innerRef.current && stored !== null) {
      const parsed = parseFloat(stored);
      if (!Number.isNaN(parsed)) innerRef.current.volume = parsed;
    }
  }, []);

  return (
    <Video
      {...props}
      ref={innerRef}
      onVolumeChange={(e) => {
        localStorage.setItem(MEDIA_VOLUME_KEY, String((e.target as HTMLVideoElement).volume));
        onVolumeChange?.(e);
      }}
    />
  );
}
