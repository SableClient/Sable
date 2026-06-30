import { useAtom } from 'jotai';
import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '$components/sidebar';
import { searchModalAtom } from '$state/searchModal';
import { ListMagnifyingGlassIcon } from '@phosphor-icons/react';
import { getPhosphorIconSize } from '$components/icons/phosphor';
import { Text, Box, color } from 'folds';
import { useNavigate } from 'react-router-dom';
import { getNavigatePath } from '$pages/pathUtils';
import { useNavigateSelected } from '$hooks/router/useNavigateSelected';

export function NavigateTab({ isBottom, isMobile }: { isBottom?: boolean; isMobile?: boolean }) {
  const [opened, setOpen] = useAtom(searchModalAtom);
  const navigateRouteActive = useNavigateSelected();
  const isNavigate = opened || navigateRouteActive;
  const navigate = useNavigate();
  const open = () => {
    if (isMobile) navigate(getNavigatePath());
    else setOpen(true);
  };

  return (
    <SidebarItem active={opened} isBottom={isBottom}>
      <SidebarItemTooltip tooltip="Search" position={isBottom ? 'Top' : 'Right'}>
        {(triggerRef) => (
          <Box direction="Column" alignItems="Center">
            <SidebarAvatar
              as="button"
              ref={triggerRef}
              outlined={!isMobile}
              onClick={open}
              size={'400'}
            >
              <ListMagnifyingGlassIcon
                size={getPhosphorIconSize(isBottom ? 'inline' : 'toolbar')}
                weight={isNavigate ? 'fill' : 'regular'}
                color={isNavigate && isMobile ? color.Primary.Main : color.Background.OnContainer}
              />
            </SidebarAvatar>
            {isMobile && (
              <Text size="O400" priority="300">
                Navigate
              </Text>
            )}
          </Box>
        )}
      </SidebarItemTooltip>
    </SidebarItem>
  );
}
