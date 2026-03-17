import { type VideoHTMLAttributes, forwardRef, useEffect, useRef } from 'react';
import classNames from 'classnames';
import { getMediaVolume, setMediaVolume } from '$state/mediaVolume';
import * as css from './media.css';

export const Video = forwardRef<HTMLVideoElement, VideoHTMLAttributes<HTMLVideoElement>>(
  ({ className, ...props }, ref) => (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video className={classNames(css.Video, className)} {...props} ref={ref} />
  )
);

export function PersistedVolumeVideo({
  onVolumeChange,
  ...props
}: VideoHTMLAttributes<HTMLVideoElement>) {
  const innerRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const volume = getMediaVolume();
    if (innerRef.current && volume !== undefined) innerRef.current.volume = volume;
  }, []);

  return (
    <Video
      {...props}
      ref={innerRef}
      onVolumeChange={(e) => {
        setMediaVolume((e.target as HTMLVideoElement).volume);
        onVolumeChange?.(e);
      }}
    />
  );
}
