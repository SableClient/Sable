import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { UserQuickTools } from '$pages/client/sidebar/UserQuickTools';

export function UserQuickToolsProvider() {
  const screenSize = useScreenSizeContext();
  const compact = screenSize === ScreenSize.Mobile;
  if (!compact) return null;
  return <UserQuickTools compact />;
}
