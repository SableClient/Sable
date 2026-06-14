import type { RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Text, Box, config, Spinner, IconButton, Line, toRem } from 'folds';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { SearchOrderBy } from '$types/matrix-sdk';
import { PageHero, PageHeroEmpty, PageHeroSection } from '$components/page';
import { useMatrixClient } from '$hooks/useMatrixClient';
import type { SearchPathSearchParams } from '$pages/paths';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { SequenceCard } from '$components/sequence-card';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { ScrollTopContainer } from '$components/scroll-top-container';
import { ContainerColor } from '$styles/ContainerColor.css';
import { decodeSearchParamValueArray, encodeSearchParamValueArray } from '$pages/pathUtils';
import { useSelectedRooms } from '$state/hooks/roomList';
import { allRoomsAtom } from '$state/room-list/roomList';
import { isRoom } from '$utils/room';
import { useAtomValue } from 'jotai';
import { mDirectAtom } from '$state/mDirectList';
import { VirtualTile } from '$components/virtualizer';
import type { MessageSearchParams } from './useMessageSearch';
import { useMessageSearch } from './useMessageSearch';
import type { SearchHasType } from './useMessageSearch';
import { SearchResultGroup } from './SearchResultGroup';
import { SearchResultTimelineItem } from './SearchResultTimelineItem';
import { SearchInput } from './SearchInput';
import { SearchFilters } from './SearchFilters';
import { Icon, Icons } from '$app/icons';

const useSearchPathSearchParams = (searchParams: URLSearchParams): SearchPathSearchParams =>
  useMemo(
    () => ({
      global: searchParams.get('global') ?? undefined,
      term: searchParams.get('term') ?? undefined,
      order: searchParams.get('order') ?? undefined,
      rooms: searchParams.get('rooms') ?? undefined,
      senders: searchParams.get('senders') ?? undefined,
      has: searchParams.get('has') ?? undefined,
      grouped: searchParams.get('grouped') ?? undefined,
    }),
    [searchParams]
  );

type MessageSearchProps = {
  defaultRoomsFilterName: string;
  allowGlobal?: boolean;
  rooms: string[];
  senders?: string[];
  scrollRef: RefObject<HTMLDivElement | null>;
};

const VALID_HAS_TYPES = new Set<SearchHasType>(['image', 'file', 'audio', 'video', 'link']);

export function MessageSearch({
  defaultRoomsFilterName,
  allowGlobal,
  rooms,
  senders,
  scrollRef,
}: Readonly<MessageSearchProps>) {
  const mx = useMatrixClient();
  const mDirects = useAtomValue(mDirectAtom);
  const allRoomsSelector = useCallback((rId: string) => isRoom(mx.getRoom(rId)), [mx]);
  const allRooms = useSelectedRooms(allRoomsAtom, allRoomsSelector);
  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [urlPreview] = useSetting(settingsAtom, 'urlPreview');
  const [legacyUsernameColor] = useSetting(settingsAtom, 'legacyUsernameColor');

  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollTopAnchorRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const searchPathSearchParams = useSearchPathSearchParams(searchParams);
  const { navigateRoom } = useRoomNavigate();

  const searchParamRooms = useMemo(() => {
    if (searchPathSearchParams.rooms) {
      const joinedRoomIds = decodeSearchParamValueArray(searchPathSearchParams.rooms).filter(
        (rId) => allRooms.includes(rId)
      );
      return joinedRoomIds;
    }
    return undefined;
  }, [allRooms, searchPathSearchParams.rooms]);
  const searchParamsSenders = useMemo(() => {
    if (searchPathSearchParams.senders) {
      return decodeSearchParamValueArray(searchPathSearchParams.senders);
    }
    return undefined;
  }, [searchPathSearchParams.senders]);
  const searchParamHasTypes = useMemo(() => {
    if (!searchPathSearchParams.has) return undefined;
    const decoded = decodeSearchParamValueArray(searchPathSearchParams.has).filter(
      (t): t is SearchHasType => VALID_HAS_TYPES.has(t as SearchHasType)
    );
    return decoded.length > 0 ? decoded : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchPathSearchParams.has]);

  const isGlobal = searchPathSearchParams.global === 'true';

  const msgSearchParams: MessageSearchParams = useMemo(() => {
    const defaultRooms = isGlobal ? undefined : rooms;

    return {
      term: searchPathSearchParams.term,
      order: searchPathSearchParams.order ?? SearchOrderBy.Recent,
      rooms: searchParamRooms ?? defaultRooms,
      senders: searchParamsSenders ?? senders,
      hasTypes: searchParamHasTypes,
    };
  }, [
    isGlobal,
    searchPathSearchParams,
    searchParamRooms,
    searchParamsSenders,
    searchParamHasTypes,
    rooms,
    senders,
  ]);

  const isSearching =
    !!msgSearchParams.term || (!!msgSearchParams.hasTypes && msgSearchParams.hasTypes.length > 0);

  const searchMessages = useMessageSearch(msgSearchParams);

  const { status, data, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    enabled:
      !!msgSearchParams.term || (!!msgSearchParams.hasTypes && msgSearchParams.hasTypes.length > 0),
    queryKey: [
      'search',
      msgSearchParams.term,
      msgSearchParams.order,
      msgSearchParams.rooms,
      msgSearchParams.senders,
      msgSearchParams.hasTypes,
    ],
    queryFn: ({ pageParam }) => searchMessages(pageParam),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextToken,
  });

  const groups = useMemo(() => data?.pages.flatMap((result) => result.groups) ?? [], [data]);
  const highlights = useMemo(() => {
    const mixed = data?.pages.flatMap((result) => result.highlights);
    return Array.from(new Set(mixed));
  }, [data]);
  // Only the first page carries in-memory results (no pagination for encrypted rooms)
  const inMemoryRoomCount = data?.pages[0]?.inMemoryRoomCount ?? 0;

  // Flatten groups for ungrouped timeline view
  const isGrouped = searchPathSearchParams.grouped !== 'false';
  const flatItems = useMemo(() => {
    if (isGrouped) return [];
    return groups.flatMap((group) =>
      group.items.map((item) => ({
        ...item,
        roomId: group.roomId,
      }))
    );
  }, [groups, isGrouped]);

  const virtualizer = useVirtualizer({
    count: isGrouped ? groups.length : flatItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 40,
    overscan: 1,
  });
  const vItems = virtualizer.getVirtualItems();

  const handleSearch = (term: string) => {
    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      newParams.delete('term');
      newParams.append('term', term);
      return newParams;
    });
  };
  const handleSearchClear = () => {
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
    }
    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      newParams.delete('term');
      return newParams;
    });
  };

  const handleSelectedRoomsChange = (selectedRooms?: string[]) => {
    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      newParams.delete('rooms');
      if (selectedRooms && selectedRooms.length > 0) {
        newParams.append('rooms', encodeSearchParamValueArray(selectedRooms));
      }
      return newParams;
    });
  };
  const handleGlobalChange = (global?: boolean) => {
    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      newParams.delete('global');
      if (global) {
        newParams.append('global', 'true');
      }
      return newParams;
    });
  };

  const handleOrderChange = (order?: string) => {
    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      newParams.delete('order');
      if (order) {
        newParams.append('order', order);
      }
      return newParams;
    });
  };

  const handleGroupedChange = (grouped?: boolean) => {
    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      newParams.delete('grouped');
      if (grouped === false) {
        newParams.append('grouped', 'false');
      }
      return newParams;
    });
  };

  const handleHasTypesChange = (hasTypes?: SearchHasType[]) => {
    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      newParams.delete('has');
      if (hasTypes && hasTypes.length > 0) {
        newParams.append('has', encodeSearchParamValueArray(hasTypes));
      }
      return newParams;
    });
  };

  const handleSendersChange = (newSenders?: string[]) => {
    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      newParams.delete('senders');
      if (newSenders && newSenders.length > 0) {
        newParams.append('senders', encodeSearchParamValueArray(newSenders));
      }
      return newParams;
    });
  };

  const lastVItem = vItems.at(-1);
  const lastVItemIndex: number | undefined = lastVItem?.index;
  const lastItemIndex = isGrouped ? groups.length - 1 : flatItems.length - 1;
  useEffect(() => {
    if (
      lastItemIndex > -1 &&
      lastItemIndex === lastVItemIndex &&
      !isFetchingNextPage &&
      hasNextPage
    ) {
      fetchNextPage();
    }
  }, [lastVItemIndex, lastItemIndex, fetchNextPage, isFetchingNextPage, hasNextPage]);

  return (
    <Box direction="Column" gap="700">
      <ScrollTopContainer scrollRef={scrollRef} anchorRef={scrollTopAnchorRef}>
        <IconButton
          onClick={() => virtualizer.scrollToOffset(0)}
          variant="SurfaceVariant"
          radii="Pill"
          outlined
          size="300"
          aria-label="Scroll to Top"
        >
          <Icon src={Icons.ChevronTop} size="300" />
        </IconButton>
      </ScrollTopContainer>
      <Box ref={scrollTopAnchorRef} direction="Column" gap="300">
        <SearchInput
          active={isSearching}
          loading={status === 'pending'}
          searchInputRef={searchInputRef}
          onSearch={handleSearch}
          onReset={handleSearchClear}
        />
        <SearchFilters
          defaultRoomsFilterName={defaultRoomsFilterName}
          allowGlobal={allowGlobal}
          roomList={isGlobal ? allRooms : rooms}
          defaultRooms={isGlobal ? allRooms : rooms}
          selectedRooms={searchParamRooms}
          onSelectedRoomsChange={handleSelectedRoomsChange}
          global={searchPathSearchParams.global === 'true'}
          onGlobalChange={handleGlobalChange}
          order={msgSearchParams.order}
          onOrderChange={handleOrderChange}
          grouped={searchPathSearchParams.grouped !== 'false'}
          onGroupedChange={handleGroupedChange}
          hasTypes={searchParamHasTypes}
          onHasTypesChange={handleHasTypesChange}
          senders={searchParamsSenders ?? senders}
          onSendersChange={handleSendersChange}
        />
      </Box>

      {inMemoryRoomCount > 0 && status !== 'pending' && (
        <Box
          className={ContainerColor({ variant: 'Secondary' })}
          style={{ padding: config.space.S300, borderRadius: config.radii.R400 }}
          alignItems="Center"
          gap="200"
        >
          <Icon size="200" src={Icons.Info} />
          <Text size="T300">
            {`${inMemoryRoomCount} ${inMemoryRoomCount === 1 ? 'room' : 'rooms'} searched from local cache only.`}
          </Text>
        </Box>
      )}

      {!isSearching && status === 'pending' && (
        <PageHeroEmpty>
          <PageHeroSection>
            <PageHero
              icon={<Icon size="600" src={Icons.Message} />}
              title="Search Messages"
              subTitle="Find helpful messages in your community by searching with related keywords."
            />
          </PageHeroSection>
        </PageHeroEmpty>
      )}

      {isSearching && groups.length === 0 && status === 'success' && (
        <Box
          className={ContainerColor({ variant: 'Warning' })}
          style={{ padding: config.space.S300, borderRadius: config.radii.R400 }}
          alignItems="Center"
          gap="200"
        >
          <Icon size="200" src={Icons.Info} />
          <Text>
            {msgSearchParams.term ? (
              <>
                No results found for <b>{`"${msgSearchParams.term}"`}</b>
              </>
            ) : (
              'No results found.'
            )}
          </Text>
        </Box>
      )}

      {((isSearching && status === 'pending') ||
        ((isGrouped ? groups.length : flatItems.length) > 0 && vItems.length === 0)) && (
        <Box direction="Column" gap="100">
          {Array.from({ length: 8 }).map(() => (
            <SequenceCard
              variant="SurfaceVariant"
              key={crypto.randomUUID()}
              style={{ minHeight: toRem(80) }}
            />
          ))}
        </Box>
      )}

      {vItems.length > 0 && (
        <Box direction="Column" gap="300">
          <Box direction="Column" gap="200">
            <Text size="H5">
              {msgSearchParams.term
                ? `Results for "${msgSearchParams.term}"`
                : msgSearchParams.hasTypes && msgSearchParams.hasTypes.length > 0
                  ? `Results for ${msgSearchParams.hasTypes.join(', ')}`
                  : 'Results'}
            </Text>
            <Line size="300" variant="Surface" />
          </Box>
          <div
            style={{
              position: 'relative',
              height: virtualizer.getTotalSize(),
            }}
          >
            {isGrouped
              ? vItems.map((vItem) => {
                  const group = groups[vItem.index];
                  if (!group) return null;
                  const groupRoom = mx.getRoom(group.roomId);
                  if (!groupRoom) return null;

                  return (
                    <VirtualTile
                      virtualItem={vItem}
                      style={{ paddingBottom: config.space.S500 }}
                      ref={virtualizer.measureElement}
                      key={vItem.index}
                    >
                      <SearchResultGroup
                        room={groupRoom}
                        highlights={highlights}
                        items={group.items}
                        mediaAutoLoad={mediaAutoLoad}
                        urlPreview={urlPreview}
                        onOpen={navigateRoom}
                        legacyUsernameColor={legacyUsernameColor || mDirects.has(groupRoom.roomId)}
                        hour24Clock={hour24Clock}
                        dateFormatString={dateFormatString}
                      />
                    </VirtualTile>
                  );
                })
              : vItems.map((vItem) => {
                  const flatItem = flatItems[vItem.index];
                  if (!flatItem) return null;
                  const itemRoom = mx.getRoom(flatItem.roomId);
                  if (!itemRoom) return null;

                  return (
                    <VirtualTile
                      virtualItem={vItem}
                      style={{ paddingBottom: config.space.S200 }}
                      ref={virtualizer.measureElement}
                      key={vItem.index}
                    >
                      <SearchResultTimelineItem
                        room={itemRoom}
                        item={flatItem}
                        highlights={highlights}
                        mediaAutoLoad={mediaAutoLoad}
                        urlPreview={urlPreview}
                        onOpen={navigateRoom}
                        legacyUsernameColor={legacyUsernameColor || mDirects.has(itemRoom.roomId)}
                        hour24Clock={hour24Clock}
                        dateFormatString={dateFormatString}
                      />
                    </VirtualTile>
                  );
                })}
          </div>
          {isFetchingNextPage && (
            <Box justifyContent="Center" alignItems="Center">
              <Spinner size="600" variant="Secondary" />
            </Box>
          )}
        </Box>
      )}

      {error && (
        <Box
          className={ContainerColor({ variant: 'Critical' })}
          style={{
            padding: config.space.S300,
            borderRadius: config.radii.R400,
          }}
          direction="Column"
          gap="200"
        >
          <Text size="L400">{error.name}</Text>
          <Text size="T300">{error.message}</Text>
        </Box>
      )}
    </Box>
  );
}
