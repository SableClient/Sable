import { color, config } from 'folds';

export function SidebarStackSeparator() {
  return (
    <div
      role="separator"
      style={{
        width: config.borderWidth.B600,
        height: config.borderWidth.B600,
        margin: `${config.space.S200} auto`,
        borderRadius: '9999px',
        backgroundColor: color.Background.ContainerLine,
      }}
    />
  );
}
