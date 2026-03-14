import { ReactNode } from 'react';
import classNames from 'classnames';
import { Box, ContainerColor, as, color } from 'folds';
import * as css from './layout.css';

type BubbleArrowProps = {
  variant: ContainerColor;
};
function BubbleLeftArrow({ variant }: BubbleArrowProps) {
  return (
    <svg
      className={css.BubbleLeftArrow}
      width="9"
      height="8"
      viewBox="0 0 9 8"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.00004 8V0H4.82847C3.04666 0 2.15433 2.15428 3.41426 3.41421L8.00004 8H9.00004Z"
        fill={color[variant].Container}
      />
    </svg>
  );
}
function BubbleRightArrow({ variant }: BubbleArrowProps) {
  return (
    <svg
      className={css.BubbleRightArrow}
      style={{ transform: 'scaleX(-1)' }}
      width="9"
      height="8"
      viewBox="0 0 9 8"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.00004 8V0H4.82847C3.04666 0 2.15433 2.15428 3.41426 3.41421L8.00004 8H9.00004Z"
        fill={color[variant].Container}
      />
    </svg>
  );
}

type BubbleLayoutProps = {
  hideBubble?: boolean;
  before?: ReactNode;
  header?: ReactNode;
  align?: 'left' | 'right';
};

export const BubbleLayout = as<'div', BubbleLayoutProps>(
  ({ hideBubble, before, header, align = 'left', children, ...props }, ref) => {
    const isRight = align === 'right';

    return (
      <Box gap="300" {...props} ref={ref}>
        {!isRight && (
          <Box className={css.BubbleBefore} shrink="No">
            {before}
          </Box>
        )}

        <Box grow="Yes" direction="Column" alignItems={isRight ? 'End' : 'Start'}>
          {header}
          {hideBubble ? (
            children
          ) : (
            <Box className={css.BubbleWrapper}>
              <Box
                className={
                  hideBubble
                    ? undefined
                    : classNames(
                        css.BubbleContent,
                        before && !isRight ? css.BubbleContentArrowLeft : undefined,
                        before && isRight ? css.BubbleContentArrowRight : undefined
                      )
                }
                direction="Column"
              >
                {before && !isRight ? <BubbleLeftArrow variant="SurfaceVariant" /> : null}
                {before && isRight ? <BubbleRightArrow variant="SurfaceVariant" /> : null}

                {children}
              </Box>
            </Box>
          )}
        </Box>

        {isRight && (
          <Box className={css.BubbleBefore} shrink="No">
            {before}
          </Box>
        )}
      </Box>
    );
  }
);
