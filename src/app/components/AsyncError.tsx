import { Text, color } from 'folds';
import type { AsyncState } from '$hooks/useAsyncCallback';
import { AsyncStatus } from '$hooks/useAsyncCallback';

type AsyncErrorProps = {
  state: AsyncState<unknown, unknown>;
  prefix?: string;
  size?: 'T200' | 'T300';
  bold?: boolean;
};

export function AsyncError({ state, prefix, size = 'T200', bold }: AsyncErrorProps) {
  if (state.status !== AsyncStatus.Error) return null;

  const message = prefix
    ? `${prefix}! ${state.error instanceof Error ? state.error.message : String(state.error)}`
    : state.error instanceof Error
      ? state.error.message
      : String(state.error);

  const content = bold ? <b>{message}</b> : message;

  return (
    <Text style={{ color: color.Critical.Main }} size={size}>
      {content}
    </Text>
  );
}
