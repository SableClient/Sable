import { Line, toRem } from 'folds';

export function SidebarStackSeparator() {
  return (
    <Line
      role="separator"
      style={{ width: toRem(28), margin: `${toRem(4)} auto` }}
      variant="Background"
      size="300"
    />
  );
}
