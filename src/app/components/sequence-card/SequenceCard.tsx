import type { ComponentProps } from 'react';
import { Box, as } from 'folds';
import classNames from 'classnames';
import type { ContainerColorVariants } from '$styles/ContainerColor.css';
import { ContainerColor } from '$styles/ContainerColor.css';
import * as css from './style.css';

export const SequenceCard = as<
  'div',
  ComponentProps<typeof Box> & ContainerColorVariants & css.SequenceCardVariants
>(
  (
    {
      as: AsSequenceCard = 'div',
      className,
      variant,
      radii,
      firstChild,
      lastChild,
      outlined,
      mergeBorder,
      ...props
    },
    ref
  ) => (
    <Box
      as={AsSequenceCard}
      className={classNames(
        css.SequenceCard({ radii, outlined, mergeBorder }),
        ContainerColor({ variant }),
        className
      )}
      data-sequence-card="true"
      data-first-child={firstChild}
      data-last-child={lastChild}
      {...props}
      ref={ref}
    />
  )
);
