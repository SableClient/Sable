import type { ImgHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import classNames from 'classnames';
import { useSetting } from '$state/hooks/settings';
import { isPixelatedChatRendering, settingsAtom } from '$state/settings';
import * as css from './media.css';

export const Image = forwardRef<HTMLImageElement, ImgHTMLAttributes<HTMLImageElement>>(
  ({ className, alt, ...props }, ref) => {
    const [pixelatedImageRendering] = useSetting(settingsAtom, 'pixelatedImageRendering');

    return (
      <img
        className={classNames(
          css.Image,
          isPixelatedChatRendering(pixelatedImageRendering) && css.ImagePixelated,
          className
        )}
        alt={alt}
        {...props}
        ref={ref}
      />
    );
  }
);
