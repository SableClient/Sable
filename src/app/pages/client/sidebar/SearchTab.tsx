import { Icon, Icons } from 'folds';
import { useAtom } from 'jotai';
import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '$components/sidebar';
import { searchModalAtom } from '$state/searchModal';
import { prefetchSearchModal } from '$pages/routePrefetch';

export function SearchTab() {
  const [opened, setOpen] = useAtom(searchModalAtom);

  const open = () => {
    void prefetchSearchModal();
    setOpen(true);
  };
  const handlePrefetch = () => {
    void prefetchSearchModal();
  };

  return (
    <SidebarItem active={opened}>
      <SidebarItemTooltip tooltip="Search">
        {(triggerRef) => (
          <SidebarAvatar
            as="button"
            ref={triggerRef}
            outlined
            onClick={open}
            onMouseEnter={handlePrefetch}
            onFocus={handlePrefetch}
          >
            <Icon src={Icons.Search} filled={opened} />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
    </SidebarItem>
  );
}
