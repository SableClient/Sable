import { useAtom } from 'jotai';
import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '$components/sidebar';
import { searchModalAtom } from '$state/searchModal';
import { ListMagnifyingGlassIcon } from '@phosphor-icons/react';
import { getPhosphorIconSize } from '$components/icons/phosphor';

export function SearchTab({isBottom}:{isBottom?: boolean}) {
  const [opened, setOpen] = useAtom(searchModalAtom);

  const open = () => setOpen(true);

  return (
    <SidebarItem active={opened} isBottom={isBottom}>
      <SidebarItemTooltip tooltip="Search" position={isBottom ? "Top" : "Right"}>
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} outlined onClick={open} size="300">
            <ListMagnifyingGlassIcon
              size={getPhosphorIconSize('inline')}
              weight={opened ? 'fill' : 'regular'}
            />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
    </SidebarItem>
  );
}
