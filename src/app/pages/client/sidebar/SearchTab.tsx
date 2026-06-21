import { useAtom } from 'jotai';
import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '$components/sidebar';
import { searchModalAtom } from '$state/searchModal';
import { getPhosphorSize } from '$components/icons/phosphor';
import { ListMagnifyingGlassIcon } from '@phosphor-icons/react';

export function SearchTab({isBottom}:{isBottom?: boolean}) {
  const [opened, setOpen] = useAtom(searchModalAtom);

  const open = () => setOpen(true);

  return (
    <SidebarItem active={opened} isBottom={isBottom}>
      <SidebarItemTooltip tooltip="Search" position={isBottom ? "Top" : "Right"}>
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} outlined onClick={open} size="300">
            <ListMagnifyingGlassIcon
              size={getPhosphorSize().inline}
              weight={opened ? 'fill' : 'regular'}
            />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
    </SidebarItem>
  );
}
