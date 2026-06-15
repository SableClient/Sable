import { useAtom } from 'jotai';
import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '$components/sidebar';
import { searchModalAtom } from '$state/searchModal';
import { getPhosphorSize, Compass } from '$components/icons/phosphor';

export function SearchTab() {
  const [opened, setOpen] = useAtom(searchModalAtom);

  const open = () => setOpen(true);

  return (
    <SidebarItem active={opened}>
      <SidebarItemTooltip tooltip="Search">
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} outlined onClick={open}>
            <Compass size={getPhosphorSize().toolbar} weight={opened ? 'fill' : 'regular'} />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
    </SidebarItem>
  );
}
