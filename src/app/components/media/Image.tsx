import type { ImgHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import classNames from 'classnames';
import { useSetting } from '$state/hooks/settings';
import { isPixelatedRendering, settingsAtom } from '$state/settings';
import * as css from './media.css';
import type { IImageInfo } from '$types/matrix/common';

type ImageProps = ImgHTMLAttributes<HTMLImageElement> & { info?: IImageInfo };

export const Image = forwardRef<HTMLImageElement, ImageProps>(
  ({ className, alt, info, ...props }, ref) => {
    const [pixelatedImageRendering] = useSetting(settingsAtom, 'pixelatedImageRendering');

    return (
      <img
        className={classNames(
          css.Image,
          isPixelatedRendering(pixelatedImageRendering, info) && css.ImagePixelated,
          className
        )}
        alt={alt}
        {...props}
        ref={ref}
      />
    );
  }
);
