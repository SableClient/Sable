import type { ReactNode } from 'react';
import classNames from 'classnames';
import { as, Spinner } from 'folds';
import * as css from './Button.css';

type SpinnerProps = {
  /** Swaps `before` for a spinner and disables the button. */
  loading?: boolean;
  spinnerVariant?: 'Primary' | 'Secondary' | 'Success' | 'Warning' | 'Critical';
  spinnerFill?: 'Solid' | 'Soft';
  spinnerSize?: '50' | '100' | '200' | '300' | '400' | '500' | '600' | 'Inherit';
};

type ButtonProps = SpinnerProps & {
  before?: ReactNode;
  after?: ReactNode;
};

export const Button = as<'button', css.ButtonVariants & ButtonProps>(
  (
    {
      as: AsButton = 'button',
      className,
      size,
      variant,
      fill,
      outlined,
      radii,
      before,
      after,
      loading,
      spinnerVariant = 'Primary',
      spinnerFill = 'Solid',
      spinnerSize = '200',
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const leading = loading ? (
      <Spinner variant={spinnerVariant} fill={spinnerFill} size={spinnerSize} />
    ) : (
      before
    );

    return (
      <AsButton
        className={classNames(css.Button({ size, variant, fill, outlined, radii }), className)}
        data-ui-before={leading ? true : undefined}
        data-ui-after={after ? true : undefined}
        disabled={loading || disabled}
        aria-busy={loading || undefined}
        {...props}
        ref={ref}
      >
        {leading}
        {children}
        {after}
      </AsButton>
    );
  }
);
