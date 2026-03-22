import { CompassIcon } from '@phosphor-icons/react/dist/csr/Compass';
import { useNavigate } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '$components/sidebar';
import { useExploreSelected } from '$hooks/router/useExploreSelected';
import {
  getExploreFeaturedPath,
  getExplorePath,
  getExploreServerPath,
  joinPathComponent,
} from '$pages/pathUtils';
import { useClientConfig } from '$hooks/useClientConfig';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { getMxIdServer } from '$utils/matrix';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useNavToActivePathAtom } from '$state/hooks/navToActivePath';
import { PhosphorIcon } from '$components/PhosphorIcon';

export function ExploreTab() {
  const mx = useMatrixClient();
  const screenSize = useScreenSizeContext();
  const clientConfig = useClientConfig();
  const navigate = useNavigate();
  const navToActivePath = useAtomValue(useNavToActivePathAtom());

  const exploreSelected = useExploreSelected();

  const handleExploreClick = () => {
    if (screenSize === ScreenSize.Mobile) {
      navigate(getExplorePath());
      return;
    }

    const activePath = navToActivePath.get('explore');
    if (activePath) {
      navigate(joinPathComponent(activePath));
      return;
    }

    if (clientConfig.featuredCommunities?.openAsDefault) {
      navigate(getExploreFeaturedPath());
      return;
    }
    const userId = mx.getUserId();
    const userServer = userId ? getMxIdServer(userId) : undefined;
    if (userServer) {
      navigate(getExploreServerPath(userServer));
      return;
    }
    navigate(getExplorePath());
  };

  return (
    <SidebarItem active={exploreSelected}>
      <SidebarItemTooltip tooltip="Explore Community">
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} outlined onClick={handleExploreClick}>
            <PhosphorIcon as={CompassIcon} weight={exploreSelected ? 'fill' : 'regular'} />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
    </SidebarItem>
  );
}
