import { Icon, Icons } from 'folds';
import { useAtom } from 'jotai';
import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '$components/sidebar';
import { searchModalAtom } from '$state/searchModal';

export function SearchTab() {
  const [opened, setOpen] = useAtom(searchModalAtom);

  const open = () => setOpen(true);

  return (
    <SidebarItem active={opened} noIndicator>
      <SidebarItemTooltip tooltip="Search">
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} size="300" fill="Surface" active={opened} onClick={open}>
            <Icon src={Icons.Search} filled={opened} />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
    </SidebarItem>
  );
}
