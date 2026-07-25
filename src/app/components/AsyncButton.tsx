import type { ReactNode } from 'react';
import { Button, Spinner } from 'folds';

type SpinnerVariant = 'Primary' | 'Secondary' | 'Success' | 'Warning' | 'Critical';
type SpinnerSize = '50' | '100' | '200' | '300' | '400' | '500' | '600' | 'Inherit';
type SpinnerFill = 'Solid' | 'Soft';

type AsyncButtonProps = {
  loading?: boolean;
  spinnerVariant?: SpinnerVariant;
  spinnerFill?: SpinnerFill;
  spinnerSize?: SpinnerSize;
  before?: ReactNode;
  after?: ReactNode;
  children?: ReactNode;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  [key: string]: unknown;
};

export function AsyncButton({
  loading,
  spinnerVariant = 'Primary',
  spinnerFill = 'Solid',
  spinnerSize = '200',
  before,
  children,
  disabled,
  ...rest
}: AsyncButtonProps) {
  const spinner = loading ? (
    <Spinner variant={spinnerVariant} fill={spinnerFill} size={spinnerSize} />
  ) : undefined;

  return (
    <Button disabled={loading || disabled} before={spinner} {...rest}>
      {children}
    </Button>
  );
}
