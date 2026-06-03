import type { ChangeEventHandler, MouseEventHandler } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RectCords } from 'folds';
import {
  Avatar,
  Box,
  Chip,
  Text,
  Icon,
  Icons,
  Line,
  config,
  PopOut,
  Menu,
  MenuItem,
  Header,
  toRem,
  Scroll,
  Button,
  Input,
  Badge,
} from 'folds';
import type { IconSrc } from 'folds';
import { SearchOrderBy } from '$types/matrix-sdk';
import type { RoomMember } from '$types/matrix-sdk';
import FocusTrap from 'focus-trap-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useAtomValue } from 'jotai';
import { settingsAtom } from '$state/settings';
import { useClientConfig } from '$hooks/useClientConfig';
import { getRoomIconSrc } from '$utils/room';
import { factoryRoomIdByAtoZ } from '$utils/sort';
import type { SearchItemStrGetter, UseAsyncSearchOptions } from '$hooks/useAsyncSearch';
import { useAsyncSearch } from '$hooks/useAsyncSearch';
import type { DebounceOptions } from '$hooks/useDebounce';
import { useDebounce } from '$hooks/useDebounce';
import { VirtualTile } from '$components/virtualizer';
import { stopPropagation } from '$utils/keyboard';
import { UserAvatar } from '$components/user-avatar';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import type { SearchHasType } from './useMessageSearch';

type GroupButtonProps = {
  grouped?: boolean;
  onChange: (grouped?: boolean) => void;
};
function GroupButton({ grouped = true, onChange }: GroupButtonProps) {
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const setGrouping = (g?: boolean) => {
    setMenuAnchor(undefined);
    onChange(g);
  };
  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  return (
    <PopOut
      anchor={menuAnchor}
      align="End"
      position="Bottom"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => setMenuAnchor(undefined),
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu variant="Surface">
            <Header size="300" variant="Surface" style={{ padding: `0 ${config.space.S300}` }}>
              <Text size="L400">Group results</Text>
            </Header>
            <Line variant="Surface" size="300" />
            <div style={{ padding: config.space.S100 }}>
              <MenuItem
                onClick={() => setGrouping(true)}
                variant="Surface"
                size="300"
                radii="300"
                aria-pressed={grouped}
              >
                <Text size="T300">By Room</Text>
              </MenuItem>
              <MenuItem
                onClick={() => setGrouping(false)}
                variant="Surface"
                size="300"
                radii="300"
                aria-pressed={!grouped}
              >
                <Text size="T300">Timeline</Text>
              </MenuItem>
            </div>
          </Menu>
        </FocusTrap>
      }
    >
      <Chip
        onClick={handleOpenMenu}
        variant="SurfaceVariant"
        radii="Pill"
        before={<Icon size="100" src={grouped ? Icons.Hash : Icons.Clock} />}
      >
        <Text size="T200">{grouped ? 'Grouped' : 'Timeline'}</Text>
      </Chip>
    </PopOut>
  );
}

type OrderButtonProps = {
  order?: string;
  onChange: (order?: string) => void;
};
function OrderButton({ order, onChange }: OrderButtonProps) {
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const rankOrder = order === SearchOrderBy.Rank;

  const setOrder = (o?: string) => {
    setMenuAnchor(undefined);
    onChange(o);
  };
  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  return (
    <PopOut
      anchor={menuAnchor}
      align="End"
      position="Bottom"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => setMenuAnchor(undefined),
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu variant="Surface">
            <Header size="300" variant="Surface" style={{ padding: `0 ${config.space.S300}` }}>
              <Text size="L400">Sort by</Text>
            </Header>
            <Line variant="Surface" size="300" />
            <div style={{ padding: config.space.S100 }}>
              <MenuItem
                onClick={() => setOrder()}
                variant="Surface"
                size="300"
                radii="300"
                aria-pressed={!rankOrder}
              >
                <Text size="T300">Recent</Text>
              </MenuItem>
              <MenuItem
                onClick={() => setOrder(SearchOrderBy.Rank)}
                variant="Surface"
                size="300"
                radii="300"
                aria-pressed={rankOrder}
              >
                <Text size="T300">Relevance</Text>
              </MenuItem>
            </div>
          </Menu>
        </FocusTrap>
      }
    >
      <Chip
        variant="SurfaceVariant"
        radii="Pill"
        after={<Icon size="50" src={Icons.Sort} />}
        onClick={handleOpenMenu}
      >
        {rankOrder ? <Text size="T200">Relevance</Text> : <Text size="T200">Recent</Text>}
      </Chip>
    </PopOut>
  );
}

const SEARCH_OPTS: UseAsyncSearchOptions = {
  limit: 20,
  matchOptions: {
    contain: true,
  },
};
const SEARCH_DEBOUNCE_OPTS: DebounceOptions = {
  wait: 200,
};

type SelectRoomButtonProps = {
  roomList: string[];
  selectedRooms?: string[];
  onChange: (rooms?: string[]) => void;
};
function SelectRoomButton({ roomList, selectedRooms, onChange }: SelectRoomButtonProps) {
  const mx = useMatrixClient();
  const { features } = useClientConfig();
  const settings = useAtomValue(settingsAtom);
  const encryptedSearchActive = features?.encryptedSearch !== false && settings.encryptedSearch;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const [localSelected, setLocalSelected] = useState(selectedRooms);

  const getRoomNameStr: SearchItemStrGetter<string> = useCallback(
    (rId) => mx.getRoom(rId)?.name ?? rId,
    [mx]
  );

  const [searchResult, searchRoomRaw, resetSearch] = useAsyncSearch(
    roomList,
    getRoomNameStr,
    SEARCH_OPTS
  );
  const rooms = Array.from(searchResult?.items ?? roomList).toSorted(factoryRoomIdByAtoZ(mx));

  const virtualizer = useVirtualizer({
    count: rooms.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
    overscan: 5,
  });
  const vItems = virtualizer.getVirtualItems();

  const searchRoom = useDebounce(searchRoomRaw, SEARCH_DEBOUNCE_OPTS);
  const handleSearchChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const value = evt.currentTarget.value.trim();
    if (!value) {
      resetSearch();
      return;
    }
    searchRoom(value);
  };

  const handleRoomClick: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const roomId = evt.currentTarget.getAttribute('data-room-id');
    if (!roomId) return;
    if (localSelected?.includes(roomId)) {
      setLocalSelected(localSelected?.filter((rId) => rId !== roomId));
      return;
    }
    const addedRooms = [...(localSelected ?? [])];
    addedRooms.push(roomId);
    setLocalSelected(addedRooms);
  };

  const handleSave = () => {
    setMenuAnchor(undefined);
    onChange(localSelected);
  };

  const handleDeselectAll = () => {
    setMenuAnchor(undefined);
    onChange(undefined);
  };

  useEffect(() => {
    setLocalSelected(selectedRooms);
    resetSearch();
  }, [menuAnchor, selectedRooms, resetSearch]);

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  return (
    <PopOut
      anchor={menuAnchor}
      align="Center"
      position="Bottom"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => setMenuAnchor(undefined),
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu variant="Surface" style={{ width: toRem(250) }}>
            <Box direction="Column" style={{ maxHeight: toRem(450), maxWidth: toRem(300) }}>
              <Box
                shrink="No"
                direction="Column"
                gap="100"
                style={{ padding: config.space.S200, paddingBottom: 0 }}
              >
                <Text size="L400">Search</Text>
                <Input
                  onChange={handleSearchChange}
                  size="300"
                  radii="300"
                  after={
                    searchResult && searchResult.items.length > 0 ? (
                      <Badge variant="Secondary" size="400" radii="Pill">
                        <Text size="L400">{searchResult.items.length}</Text>
                      </Badge>
                    ) : null
                  }
                />
              </Box>
              <Scroll ref={scrollRef} size="300" hideTrack>
                <Box
                  direction="Column"
                  gap="100"
                  style={{
                    padding: config.space.S200,
                    paddingRight: 0,
                  }}
                >
                  {!searchResult && <Text size="L400">Rooms</Text>}
                  {searchResult && <Text size="L400">{`Rooms for "${searchResult.query}"`}</Text>}
                  {searchResult && searchResult.items.length === 0 && (
                    <Text style={{ padding: config.space.S400 }} size="T300" align="Center">
                      No match found!
                    </Text>
                  )}
                  <div
                    style={{
                      position: 'relative',
                      height: virtualizer.getTotalSize(),
                    }}
                  >
                    {vItems.map((vItem) => {
                      const roomId = rooms[vItem.index]!;
                      const room = mx.getRoom(roomId);
                      if (!room) return null;
                      const selected = localSelected?.includes(roomId);

                      return (
                        <VirtualTile
                          virtualItem={vItem}
                          style={{ paddingBottom: config.space.S100 }}
                          ref={virtualizer.measureElement}
                          key={vItem.index}
                        >
                          <MenuItem
                            data-room-id={roomId}
                            onClick={handleRoomClick}
                            variant={selected ? 'Success' : 'Surface'}
                            size="300"
                            radii="300"
                            aria-pressed={selected}
                            before={
                              <Icon
                                size="50"
                                src={getRoomIconSrc(Icons, room.getType(), room.getJoinRule())}
                              />
                            }
                            after={
                              encryptedSearchActive && mx.isRoomEncrypted(roomId) ? (
                                <span title="Encrypted — searched from local cache">
                                  <Icon size="50" src={Icons.Lock} />
                                </span>
                              ) : null
                            }
                          >
                            <Text truncate size="T300">
                              {room.name}
                            </Text>
                          </MenuItem>
                        </VirtualTile>
                      );
                    })}
                  </div>
                </Box>
              </Scroll>
              <Line variant="Surface" size="300" />
              <Box shrink="No" direction="Column" gap="100" style={{ padding: config.space.S200 }}>
                <Button size="300" variant="Secondary" radii="300" onClick={handleSave}>
                  {localSelected && localSelected.length > 0 ? (
                    <Text size="B300">Save ({localSelected.length})</Text>
                  ) : (
                    <Text size="B300">Save</Text>
                  )}
                </Button>
                <Button
                  size="300"
                  radii="300"
                  variant="Secondary"
                  fill="Soft"
                  onClick={handleDeselectAll}
                  disabled={!localSelected || localSelected.length === 0}
                >
                  <Text size="B300">Deselect All</Text>
                </Button>
              </Box>
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      <Chip
        onClick={handleOpenMenu}
        variant="SurfaceVariant"
        radii="Pill"
        before={<Icon size="100" src={Icons.PlusCircle} />}
      >
        <Text size="T200">Select Rooms</Text>
      </Chip>
    </PopOut>
  );
}

const HAS_FILTER_OPTIONS: { type: SearchHasType; label: string; icon: IconSrc }[] = [
  { type: 'image', label: 'Image', icon: Icons.Photo },
  { type: 'file', label: 'File', icon: Icons.File },
  { type: 'audio', label: 'Audio', icon: Icons.VolumeHigh },
  { type: 'video', label: 'Video', icon: Icons.Play },
  { type: 'link', label: 'Link', icon: Icons.Link },
];

type HasFilterChipsProps = {
  hasTypes?: SearchHasType[];
  onChange: (hasTypes?: SearchHasType[]) => void;
};
function HasFilterChips({ hasTypes, onChange }: HasFilterChipsProps) {
  const toggle = (type: SearchHasType) => {
    if (hasTypes?.includes(type)) {
      const next = hasTypes.filter((t) => t !== type);
      onChange(next.length > 0 ? next : undefined);
    } else {
      onChange([...(hasTypes ?? []), type]);
    }
  };

  return (
    <>
      {HAS_FILTER_OPTIONS.map(({ type, label, icon }) => {
        const active = hasTypes?.includes(type);
        return (
          <Chip
            key={type}
            variant={active ? 'Success' : 'Surface'}
            aria-pressed={active}
            before={active ? <Icon size="100" src={Icons.Check} /> : <Icon size="100" src={icon} />}
            outlined
            onClick={() => toggle(type)}
          >
            <Text size="T200">{label}</Text>
          </Chip>
        );
      })}
    </>
  );
}

type SelectSenderButtonProps = {
  roomList: string[];
  selectedSenders?: string[];
  onChange: (senders?: string[]) => void;
};

const SENDER_SEARCH_OPTS: UseAsyncSearchOptions = { limit: 50, matchOptions: { contain: true } };
const SENDER_DEBOUNCE_OPTS: DebounceOptions = { wait: 200 };
const getMemberStr: SearchItemStrGetter<RoomMember> = (member, query) => {
  const name = member.name ?? member.userId;
  return query ? [name, member.userId] : name;
};
const getMemberDisplayName = (member: RoomMember): string => member.name ?? member.userId;
function SelectSenderButton({ roomList, selectedSenders, onChange }: SelectSenderButtonProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const scrollRef = useRef<HTMLDivElement>(null);

  const members = useMemo(() => {
    const seen = new Set<string>();
    const result: RoomMember[] = [];
    const scope = roomList.length > 0 ? roomList : [];
    for (const roomId of scope) {
      const room = mx.getRoom(roomId);
      if (!room) continue;
      for (const m of room.getMembers()) {
        if (!seen.has(m.userId)) {
          seen.add(m.userId);
          result.push(m);
        }
      }
    }
    return result.toSorted((a, b) =>
      getMemberDisplayName(a).localeCompare(getMemberDisplayName(b))
    );
  }, [mx, roomList]);

  const [searchState, searchMembersRaw, resetSearch] = useAsyncSearch(
    members,
    getMemberStr,
    SENDER_SEARCH_OPTS
  );
  const searchMembers = useDebounce(searchMembersRaw, SENDER_DEBOUNCE_OPTS);
  const handleSearchChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const value = evt.currentTarget.value.trim();
    if (!value) {
      resetSearch();
      return;
    }
    searchMembers(value);
  };

  const displayMembers = searchState?.items ?? members;

  const virtualizer = useVirtualizer({
    count: displayMembers.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32 + 4,
    overscan: 10,
  });
  const vItems = virtualizer.getVirtualItems();

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const handleMemberClick: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const userId = evt.currentTarget.getAttribute('data-user-id');
    if (!userId) return;
    if (selectedSenders?.includes(userId)) {
      const next = selectedSenders.filter((s) => s !== userId);
      onChange(next.length > 0 ? next : undefined);
    } else {
      onChange([...(selectedSenders ?? []), userId]);
    }
  };

  return (
    <PopOut
      anchor={menuAnchor}
      align="Center"
      position="Bottom"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => setMenuAnchor(undefined),
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu variant="Surface" style={{ width: toRem(260) }}>
            <Box direction="Column" style={{ maxHeight: toRem(450) }}>
              <Box
                shrink="No"
                direction="Column"
                gap="100"
                style={{ padding: config.space.S200, paddingBottom: 0 }}
              >
                <Text size="L400">From</Text>
                <Input
                  onChange={handleSearchChange}
                  size="300"
                  radii="300"
                  placeholder="Search members..."
                  after={
                    searchState && searchState.items.length > 0 ? (
                      <Badge variant="Secondary" size="400" radii="Pill">
                        <Text size="L400">{searchState.items.length}</Text>
                      </Badge>
                    ) : null
                  }
                />
              </Box>
              <Scroll ref={scrollRef} size="300" hideTrack>
                <Box
                  direction="Column"
                  gap="100"
                  style={{ padding: config.space.S200, paddingRight: 0 }}
                >
                  {displayMembers.length === 0 && (
                    <Text style={{ padding: config.space.S400 }} size="T300" align="Center">
                      No members found
                    </Text>
                  )}
                  <div style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
                    {vItems.map((vItem) => {
                      const member = displayMembers[vItem.index]!;
                      const selected = selectedSenders?.includes(member.userId);
                      return (
                        <VirtualTile
                          virtualItem={vItem}
                          style={{ paddingBottom: config.space.S100 }}
                          ref={virtualizer.measureElement}
                          key={vItem.index}
                        >
                          <MenuItem
                            data-user-id={member.userId}
                            onClick={handleMemberClick}
                            variant={selected ? 'Success' : 'Surface'}
                            size="300"
                            radii="300"
                            aria-pressed={selected}
                            before={
                              <Avatar size="200" radii="Pill">
                                <UserAvatar
                                  userId={member.userId}
                                  src={
                                    member.getMxcAvatarUrl()
                                      ? (mx.mxcUrlToHttp(
                                          member.getMxcAvatarUrl()!,
                                          32,
                                          32,
                                          'crop',
                                          undefined,
                                          false,
                                          useAuthentication
                                        ) ?? undefined)
                                      : undefined
                                  }
                                  alt={getMemberDisplayName(member)}
                                  renderFallback={() => <Icon size="50" src={Icons.User} filled />}
                                />
                              </Avatar>
                            }
                          >
                            <Box direction="Column">
                              <Text truncate size="T300">
                                {getMemberDisplayName(member)}
                              </Text>
                              <Text truncate size="T200">
                                {member.userId}
                              </Text>
                            </Box>
                          </MenuItem>
                        </VirtualTile>
                      );
                    })}
                  </div>
                </Box>
              </Scroll>
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      <Chip
        onClick={handleOpenMenu}
        variant="SurfaceVariant"
        radii="Pill"
        before={<Icon size="100" src={Icons.PlusCircle} />}
      >
        <Text size="T200">Add Sender</Text>
      </Chip>
    </PopOut>
  );
}

type SearchFiltersProps = {
  defaultRoomsFilterName: string;
  allowGlobal?: boolean;
  roomList: string[];
  defaultRooms: string[];
  selectedRooms?: string[];
  onSelectedRoomsChange: (selectedRooms?: string[]) => void;
  global?: boolean;
  onGlobalChange: (global?: boolean) => void;
  order?: string;
  onOrderChange: (order?: string) => void;
  grouped?: boolean;
  onGroupedChange: (grouped?: boolean) => void;
  hasTypes?: SearchHasType[];
  onHasTypesChange: (hasTypes?: SearchHasType[]) => void;
  senders?: string[];
  onSendersChange: (senders?: string[]) => void;
};
export function SearchFilters({
  defaultRoomsFilterName,
  allowGlobal,
  roomList,
  defaultRooms,
  selectedRooms,
  onSelectedRoomsChange,
  global,
  order,
  grouped,
  onGlobalChange,
  onOrderChange,
  onGroupedChange,
  hasTypes,
  onHasTypesChange,
  senders,
  onSendersChange,
}: SearchFiltersProps) {
  const senderScope = selectedRooms && selectedRooms.length > 0 ? selectedRooms : defaultRooms;
  const mx = useMatrixClient();

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Filter</Text>
      <Box gap="200" wrap="Wrap">
        <Chip
          variant={!global ? 'Success' : 'Surface'}
          aria-pressed={!global}
          before={!global && <Icon size="100" src={Icons.Check} />}
          outlined
          onClick={() => onGlobalChange()}
        >
          <Text size="T200">{defaultRoomsFilterName}</Text>
        </Chip>
        {allowGlobal && (
          <Chip
            variant={global ? 'Success' : 'Surface'}
            aria-pressed={global}
            before={global && <Icon size="100" src={Icons.Check} />}
            outlined
            onClick={() => onGlobalChange(true)}
          >
            <Text size="T200">Global</Text>
          </Chip>
        )}
        <Line
          style={{ margin: `${config.space.S100} 0` }}
          direction="Vertical"
          variant="Surface"
          size="300"
        />
        {selectedRooms?.map((roomId) => {
          const room = mx.getRoom(roomId);
          if (!room) return null;

          return (
            <Chip
              key={roomId}
              variant="Success"
              onClick={() => onSelectedRoomsChange(selectedRooms.filter((rId) => rId !== roomId))}
              radii="Pill"
              before={
                <Icon size="50" src={getRoomIconSrc(Icons, room.getType(), room.getJoinRule())} />
              }
              after={<Icon size="50" src={Icons.Cross} />}
            >
              <Text size="T200">{room.name}</Text>
            </Chip>
          );
        })}
        <SelectRoomButton
          roomList={roomList}
          selectedRooms={selectedRooms}
          onChange={onSelectedRoomsChange}
        />
        <Box grow="Yes" data-spacing-node />
        <GroupButton grouped={grouped} onChange={onGroupedChange} />
        <OrderButton order={order} onChange={onOrderChange} />
      </Box>
      <Box gap="200" wrap="Wrap" alignItems="Center">
        <Text size="L400" style={{ lineHeight: toRem(28) }}>
          Has:
        </Text>
        <HasFilterChips hasTypes={hasTypes} onChange={onHasTypesChange} />
        <Line
          style={{ margin: `${config.space.S100} 0` }}
          direction="Vertical"
          variant="Surface"
          size="300"
        />
        <Text size="L400" style={{ lineHeight: toRem(28) }}>
          From:
        </Text>
        {senders?.map((sender) => (
          <Chip
            key={sender}
            variant="Success"
            onClick={() => {
              const next = senders.filter((s) => s !== sender);
              onSendersChange(next.length > 0 ? next : undefined);
            }}
            radii="Pill"
            before={<Icon size="50" src={Icons.User} />}
            after={<Icon size="50" src={Icons.Cross} />}
          >
            <Text size="T200">{mx.getUser(sender)?.displayName ?? sender}</Text>
          </Chip>
        ))}
        <SelectSenderButton
          roomList={senderScope}
          selectedSenders={senders}
          onChange={onSendersChange}
        />
      </Box>
    </Box>
  );
}
