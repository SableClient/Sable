import type {
  ChangeEventHandler,
  FocusEventHandler,
  MouseEventHandler,
  ReactNode,
  RefObject,
} from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, config, Scroll } from 'folds';
import { ClockCounterClockwise } from '$components/icons/phosphor';
import FocusTrap from 'focus-trap-react';
import { isKeyHotkey } from 'is-hotkey';
import type { Room } from '$types/matrix-sdk';
import type { PrimitiveAtom } from 'jotai';
import { atom, useAtom, useSetAtom } from 'jotai';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { IEmoji } from '$plugins/emoji';
import { emojiGroups, emojis } from '$plugins/emoji';
import { preventScrollWithArrowKey } from '$utils/keyboard';
import { useRelevantImagePacks } from '$hooks/useImagePacks';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useRecentEmoji } from '$hooks/useRecentEmoji';
import { isUserId, mxcUrlToHttp } from '$utils/matrix';
import { editableActiveElement, targetFromEvent } from '$utils/dom';
import type { UseAsyncSearchOptions } from '$hooks/useAsyncSearch';
import { useAsyncSearch } from '$hooks/useAsyncSearch';
import { useDebounce } from '$hooks/useDebounce';
import { useThrottle } from '$hooks/useThrottle';
import { addRecentEmoji } from '$plugins/recent-emoji';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import type { ImagePack, PackImageReader } from '$plugins/custom-emoji';
import { ImageUsage } from '$plugins/custom-emoji';
import { getEmoticonSearchStr } from '$plugins/utils';
import { VirtualTile } from '$components/virtualizer';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useEmojiGroupIcons } from './useEmojiGroupIcons';
import { useEmojiGroupLabels } from './useEmojiGroupLabels';
import type { PreviewData } from './components';
import {
  SearchInput,
  EmojiBoardTabs,
  SidebarStack,
  SidebarDivider,
  Sidebar,
  NoStickerPacks,
  GifStatus,
  createPreviewDataAtom,
  Preview,
  EmojiItem,
  StickerItem,
  GifItem,
  CustomEmojiItem,
  ImageGroupIcon,
  GroupIcon,
  getEmojiItemInfo,
  EmojiGroup,
  EmojiBoardLayout,
} from './components';
import type { GifData } from './types';
import { EmojiBoardTab, EmojiType } from './types';
import { useClientConfig } from '$hooks/useClientConfig';
import { useFavoriteGifs } from '$hooks/useFavoriteGifs';

/* oxlint-disable typescript/no-explicit-any */
// TODO: type klipy api properly

const RECENT_GROUP_ID = 'recent_group';
const SEARCH_GROUP_ID = 'search_group';

type EmojiGroupItem = {
  id: string;
  name: string;
  items: Array<IEmoji | PackImageReader>;
};
type StickerGroupItem = {
  id: string;
  name: string;
  items: Array<PackImageReader>;
};
type GifGroupItem = {
  id: string;
  name: string;
  items: GifData[];
};

const useGroups = (
  tab: EmojiBoardTab,
  imagePacks: ImagePack[],
  data: {
    gifs: GifData[];
    favorites: GifData[];
  }
): [EmojiGroupItem[], StickerGroupItem[], GifGroupItem[]] => {
  const mx = useMatrixClient();

  const recentEmojis = useRecentEmoji(mx, 21);
  const labels = useEmojiGroupLabels();

  const emojiGroupItems = useMemo(() => {
    const g: EmojiGroupItem[] = [];
    if (tab !== EmojiBoardTab.Emoji) return g;

    g.push({
      id: RECENT_GROUP_ID,
      name: 'Recent',
      items: recentEmojis,
    });

    imagePacks.forEach((pack) => {
      let label = pack.meta.name;
      if (!label) label = isUserId(pack.id) ? 'Personal Pack' : mx.getRoom(pack.id)?.name;

      g.push({
        id: pack.id,
        name: label ?? 'Unknown',
        items: pack
          .getImages(ImageUsage.Emoticon)
          .toSorted((a, b) => a.shortcode.localeCompare(b.shortcode)),
      });
    });

    emojiGroups.forEach((group) => {
      g.push({
        id: group.id,
        name: labels[group.id],
        items: group.emojis,
      });
    });

    return g;
  }, [mx, recentEmojis, labels, imagePacks, tab]);

  const stickerGroupItems = useMemo(() => {
    const g: StickerGroupItem[] = [];
    if (tab !== EmojiBoardTab.Sticker) return g;

    imagePacks.forEach((pack) => {
      let label = pack.meta.name;
      if (!label) label = isUserId(pack.id) ? 'Personal Pack' : mx.getRoom(pack.id)?.name;

      g.push({
        id: pack.id,
        name: label ?? 'Unknown',
        items: pack
          .getImages(ImageUsage.Sticker)
          .toSorted((a, b) => a.shortcode.localeCompare(b.shortcode)),
      });
    });

    return g;
  }, [mx, imagePacks, tab]);

  const gifGroupItems = useMemo(() => {
    if (tab !== EmojiBoardTab.Gif) return [];
    return [
      {
        id: 'gif_group',
        name: 'GIFs',
        items: data.gifs,
      },
    ];
  }, [tab, data]);

  return [emojiGroupItems, stickerGroupItems, gifGroupItems];
};

const useItemRenderer = (tab: EmojiBoardTab, saveStickerEmojiBandwidth: boolean) => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const renderItem = (item: IEmoji | PackImageReader | GifData, index: number) => {
    if (tab === EmojiBoardTab.Gif) {
      const gif = item as GifData;

      let initialGifUrl = gif.preview_url ?? gif.url;
      let gifUrl = initialGifUrl.startsWith('mxc://')
        ? (mxcUrlToHttp(mx, initialGifUrl, useAuthentication) ?? '')
        : initialGifUrl;
      const aspectRatio =
        gif.width && gif.height && gif.width > 0 && gif.height > 0
          ? `${gif.width} / ${gif.height}`
          : '1 / 1';

      return (
        <GifItem
          key={gif.id + index}
          label={gif.title}
          type={EmojiType.Gif}
          data={gif.url}
          shortcode={gif.title}
          gif={gif}
          style={{ aspectRatio }}
        >
          <img
            loading="lazy"
            alt=""
            aria-hidden
            src={gifUrl}
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </GifItem>
      );
    }

    if ('unicode' in item) {
      return <EmojiItem key={item.unicode + index} emoji={item} />;
    }

    const emoji = item as PackImageReader;

    if (tab === EmojiBoardTab.Sticker) {
      return (
        <StickerItem
          key={emoji.shortcode + index}
          mx={mx}
          useAuthentication={useAuthentication}
          image={emoji}
          saveStickerEmojiBandwidth={saveStickerEmojiBandwidth}
        />
      );
    }
    return (
      <CustomEmojiItem
        key={emoji.shortcode + index}
        mx={mx}
        useAuthentication={useAuthentication}
        image={emoji}
        saveStickerEmojiBandwidth={saveStickerEmojiBandwidth}
      />
    );
  };

  return renderItem;
};

type EmojiSidebarProps = {
  activeGroupAtom: PrimitiveAtom<string | undefined>;
  packs: ImagePack[];
  saveStickerEmojiBandwidth: boolean;
  onScrollToGroup: (groupId: string) => void;
};
function EmojiSidebar({
  activeGroupAtom,
  packs,
  saveStickerEmojiBandwidth,
  onScrollToGroup,
}: Readonly<EmojiSidebarProps>) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const [activeGroupId, setActiveGroupId] = useAtom(activeGroupAtom);
  const usage = ImageUsage.Emoticon;
  const labels = useEmojiGroupLabels();
  const icons = useEmojiGroupIcons();

  const handleScrollToGroup = (groupId: string) => {
    setActiveGroupId(groupId);
    onScrollToGroup(groupId);
  };

  return (
    <Sidebar>
      <SidebarStack>
        <GroupIcon
          active={activeGroupId === RECENT_GROUP_ID}
          id={RECENT_GROUP_ID}
          label="Recent"
          icon={ClockCounterClockwise}
          onClick={handleScrollToGroup}
        />
      </SidebarStack>
      {packs.length > 0 && (
        <SidebarStack>
          <SidebarDivider />
          {packs.map((pack) => {
            let label = pack.meta.name;
            if (!label) label = isUserId(pack.id) ? 'Personal Pack' : mx.getRoom(pack.id)?.name;

            // limit width and height to 36 to prevent very large icons from breaking the layout, since custom emoji pack icons can be of any size
            // trying to get close to the render target size of the icons in the sidebar, which is around 24px
            const url = saveStickerEmojiBandwidth
              ? mxcUrlToHttp(mx, pack.getAvatarUrl(usage) ?? '', useAuthentication, 36, 36)
              : mxcUrlToHttp(mx, pack.getAvatarUrl(usage) ?? '', useAuthentication);

            return (
              <ImageGroupIcon
                key={pack.id}
                active={activeGroupId === pack.id}
                id={pack.id}
                label={label ?? 'Unknown Pack'}
                url={url ?? undefined}
                onClick={handleScrollToGroup}
              />
            );
          })}
        </SidebarStack>
      )}
      <SidebarStack
        style={{
          position: 'sticky',
          bottom: '-67%',
          zIndex: 1,
        }}
      >
        <SidebarDivider />
        {emojiGroups.map((group) => (
          <GroupIcon
            key={group.id}
            active={activeGroupId === group.id}
            id={group.id}
            label={labels[group.id]}
            icon={icons[group.id]}
            onClick={handleScrollToGroup}
          />
        ))}
      </SidebarStack>
    </Sidebar>
  );
}

type StickerSidebarProps = {
  activeGroupAtom: PrimitiveAtom<string | undefined>;
  packs: ImagePack[];
  saveStickerEmojiBandwidth: boolean;
  onScrollToGroup: (groupId: string) => void;
};
function StickerSidebar({
  activeGroupAtom,
  packs,
  saveStickerEmojiBandwidth,
  onScrollToGroup,
}: Readonly<StickerSidebarProps>) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const [activeGroupId, setActiveGroupId] = useAtom(activeGroupAtom);
  const usage = ImageUsage.Sticker;

  const handleScrollToGroup = (groupId: string) => {
    setActiveGroupId(groupId);
    onScrollToGroup(groupId);
  };

  return (
    <Sidebar>
      <SidebarStack>
        {packs.map((pack) => {
          let label = pack.meta.name;
          if (!label) label = isUserId(pack.id) ? 'Personal Pack' : mx.getRoom(pack.id)?.name;

          // limit width and height to 36 to prevent very large icons from breaking the layout, since custom emoji pack icons can be of any size
          // trying to get close to the render target size of the icons in the sidebar, which is around 24px
          const url = saveStickerEmojiBandwidth
            ? mxcUrlToHttp(mx, pack.getAvatarUrl(usage) ?? '', useAuthentication, 36, 36)
            : mxcUrlToHttp(mx, pack.getAvatarUrl(usage) ?? '', useAuthentication);

          return (
            <ImageGroupIcon
              key={pack.id}
              active={activeGroupId === pack.id}
              id={pack.id}
              label={label ?? 'Unknown Pack'}
              url={url ?? undefined}
              onClick={handleScrollToGroup}
            />
          );
        })}
      </SidebarStack>
    </Sidebar>
  );
}

type EmojiGroupHolderProps = {
  contentScrollRef: RefObject<HTMLDivElement>;
  previewAtom: PrimitiveAtom<PreviewData | undefined>;
  children?: ReactNode;
  onGroupItemClick: MouseEventHandler;
};
function EmojiGroupHolder({
  contentScrollRef,
  previewAtom,
  onGroupItemClick,
  children,
}: Readonly<EmojiGroupHolderProps>) {
  const setPreviewData = useSetAtom(previewAtom);

  const handleEmojiPreview = useCallback(
    (element: HTMLButtonElement) => {
      const emojiInfo = getEmojiItemInfo(element);
      if (!emojiInfo) return;

      setPreviewData({
        key: emojiInfo.data,
        shortcode: emojiInfo.shortcode,
      });
    },
    [setPreviewData]
  );

  const throttleEmojiHover = useThrottle(handleEmojiPreview, {
    wait: 200,
    immediate: true,
  });

  const handleEmojiHover: MouseEventHandler = (evt) => {
    const targetEl = targetFromEvent(evt.nativeEvent, 'button') as HTMLButtonElement | undefined;
    if (!targetEl) return;
    throttleEmojiHover(targetEl);
  };

  const handleEmojiFocus: FocusEventHandler = (evt) => {
    const targetEl = evt.target as HTMLButtonElement;
    handleEmojiPreview(targetEl);
  };

  return (
    <Scroll ref={contentScrollRef} size="400" onKeyDown={preventScrollWithArrowKey} hideTrack>
      <Box
        onClick={onGroupItemClick}
        onMouseMove={handleEmojiHover}
        onFocus={handleEmojiFocus}
        direction="Column"
      >
        {children}
      </Box>
    </Scroll>
  );
}

const DefaultEmojiPreview: PreviewData = { key: '🙂', shortcode: 'slight_smile' };

const SEARCH_OPTIONS: UseAsyncSearchOptions = {
  limit: 1000,
  matchOptions: {
    contain: true,
  },
};

const VIRTUAL_OVER_SCAN = 2;

type EmojiBoardProps = {
  tab?: EmojiBoardTab;
  onTabChange?: (tab: EmojiBoardTab) => void;
  imagePackRooms: Room[];
  requestClose: () => void;
  returnFocusOnDeactivate?: boolean;
  onEmojiSelect?: (unicode: string, shortcode: string) => void;
  onCustomEmojiSelect?: (mxc: string, shortcode: string) => void;
  onStickerSelect?: (mxc: string, shortcode: string, label: string) => void;
  onGifSelect?: (gif: GifData, spoiler?: boolean) => void;
  allowTextCustomEmoji?: boolean;
  addToRecentEmoji?: boolean;
  isFullWidth?: boolean;
};

const getGifName = (v: GifData) => v.title;

export function EmojiBoard({
  tab = EmojiBoardTab.Emoji,
  onTabChange,
  imagePackRooms,
  requestClose,
  returnFocusOnDeactivate,
  onEmojiSelect,
  onCustomEmojiSelect,
  onStickerSelect,
  onGifSelect,
  allowTextCustomEmoji,
  addToRecentEmoji = true,
  isFullWidth,
}: Readonly<EmojiBoardProps>) {
  const mx = useMatrixClient();
  const [saveStickerEmojiBandwidth] = useSetting(settingsAtom, 'saveStickerEmojiBandwidth');
  const [showGifPicker] = useSetting(settingsAtom, 'enableGifPicker');

  const emojiTab = tab === EmojiBoardTab.Emoji;
  const gifTab = tab === EmojiBoardTab.Gif;
  const usage = emojiTab ? ImageUsage.Emoticon : ImageUsage.Sticker;

  const previewAtom = useMemo(
    () => createPreviewDataAtom(tab === EmojiBoardTab.Emoji ? DefaultEmojiPreview : undefined),
    [tab]
  );
  const activeGroupIdAtom = useMemo(() => atom<string | undefined>(undefined), []);
  const setActiveGroupId = useSetAtom(activeGroupIdAtom);
  const imagePacks = useRelevantImagePacks(usage, imagePackRooms);
  const favoriteGifs = useFavoriteGifs().gifs as GifData[];

  const searchList = useMemo(() => {
    let list: Array<PackImageReader | IEmoji> = [];
    list = list.concat(imagePacks.flatMap((pack) => pack.getImages(usage)));
    if (emojiTab) list = list.concat(emojis);
    return list;
  }, [emojiTab, usage, imagePacks]);

  const [emojiResult, emojiSearch, resetEmojiSearch] = useAsyncSearch(
    searchList,
    getEmoticonSearchStr,
    SEARCH_OPTIONS
  );

  const [gifResult, gifSearch, resetGifSearch] = useAsyncSearch(
    favoriteGifs,
    getGifName,
    SEARCH_OPTIONS
  );

  const searchedItems = emojiResult?.items.slice(0, 100);
  const searchedGifItems = gifResult?.items.slice(0, 100) ?? favoriteGifs.toReversed();

  function useGifSearch() {
    const [gifs, setGifs] = useState<{
      gifs: GifData[];
      favorites: GifData[];
    }>({
      gifs: [],
      favorites: favoriteGifs,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const clientConfig = useClientConfig();
    const klipyApiKey = clientConfig.gifs?.klipyApiKey ?? '';

    const parseKlipyResult = useCallback((klipyResult: any): GifData => {
      const SIZE_LIMIT = 3 * 1024 * 1024; // 3MB

      const formats = klipyResult.file || {};
      const preview = formats.xs.gif || formats.sm.gif || formats.md.gif;

      // Start with full resolution GIF
      let fullRes = formats.hd.gif;
      // If full res is too large and medium exists, use medium instead
      if (fullRes && fullRes.size > SIZE_LIMIT && formats.md) {
        fullRes = formats.md.gif;
      }

      // Fallback if no suitable format found
      if (!fullRes) {
        fullRes = formats.md || preview;
      }

      // Get dimensions from the selected full resolution format
      const width = fullRes?.width || preview?.width || 0;
      const height = fullRes?.height || preview?.height || 0;

      return {
        id: klipyResult.id,
        title: klipyResult.title || 'GIF',
        url: fullRes?.url || '',
        preview_url: preview?.url || fullRes?.url || '',
        width,
        height,
        size: fullRes?.size || preview?.size || 0,
      };
    }, []);

    const searchGifs = useCallback(
      async (query: string) => {
        if (!showGifPicker) {
          return;
        }

        const trimmedQuery = query.trim();

        setLoading(true);
        setError(null);

        gifSearch(trimmedQuery);

        try {
          const url = new URL('https://api.klipy.com');
          url.pathname = `/api/v1/${klipyApiKey}/gifs/search`;
          url.searchParams.set('q', trimmedQuery);
          url.searchParams.set('per_page', '50'); // TODO: infinite scroll?

          const response = await fetch(url.toString());

          if (response.status === 200) {
            const data = await response.json();
            const results = data.data.data as any[] | undefined;

            if (results) {
              const gifData: GifData[] = results.map(parseKlipyResult);
              setGifs((old) => ({
                ...old,
                gifs: gifData,
              }));
            } else {
              setGifs((old) => ({
                ...old,
                gifs: [],
              }));
            }
          } else {
            throw new Error(`HTTP ${response.status}`);
          }
        } catch {
          setError('Failed to search GIFs');
          setGifs((old) => ({
            ...old,
            gifs: [],
          }));
        } finally {
          setLoading(false);
        }
      },
      [parseKlipyResult, klipyApiKey]
    );

    return { gifs, loading, error, searchGifs };
  }

  const { gifs, loading: gifsLoading, error: gifsError, searchGifs } = useGifSearch();
  const [emojiGroupItems, stickerGroupItems, gifGroupItems] = useGroups(tab, imagePacks, gifs);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(true);
  const groupsByTab = {
    [EmojiBoardTab.Emoji]: emojiGroupItems,
    [EmojiBoardTab.Sticker]: stickerGroupItems,
    [EmojiBoardTab.Gif]:
      showFavoritesOnly && gifs.favorites.length > 0
        ? [
            {
              id: 'favorites_group',
              name: 'Favorites',
              items: searchedGifItems,
            },
          ]
        : searchedGifItems.length > 0
          ? [
              {
                id: 'favorites_group',
                name: 'Favorites',
                items: searchedGifItems,
              },
            ].concat(gifGroupItems)
          : gifGroupItems,
  };
  const groups = groupsByTab[tab];
  const renderItem = useItemRenderer(tab, saveStickerEmojiBandwidth);

  const handleOnChange: ChangeEventHandler<HTMLInputElement> = useDebounce(
    useCallback(
      (evt) => {
        const term = evt.target.value;
        if (tab === EmojiBoardTab.Gif) {
          if (term) {
            setShowFavoritesOnly(false);
            searchGifs(term);
          } else {
            setShowFavoritesOnly(true);
            resetGifSearch();
          }
        } else if (term) {
          emojiSearch(term);
        } else {
          resetEmojiSearch();
        }
      },
      [emojiSearch, resetEmojiSearch, searchGifs, resetGifSearch, tab]
    ),
    { wait: 200 }
  );

  const contentScrollRef = useRef<HTMLDivElement>(null);
  const virtualBaseRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => contentScrollRef.current,
    estimateSize: (index: number) => {
      const group = groups[index];
      if (!group) return emojiTab ? 320 : 420;

      /**
       * estimate tile size: stickers are generally larger than emojis, and custom emojis can vary in size but are often larger than standard emojis, so we use a larger estimate for them.
       * This is a rough estimate to help the virtualizer calculate the total height and which items are in view.
       * The actual rendered size may vary, but this should provide a reasonable approximation for most cases.
       */
      const tile = emojiTab ? 48 : 112;
      /**
       * estimate number of columns that can fit in the view, with a min of 1 to avoid division by zero
       */
      const cols = Math.max(1, Math.floor(280 / tile));
      /**
       * estimate number of rows based on the number of items and columns
       */
      const rows = Math.ceil(group.items.length / cols);

      // calculate total height based on rows, with some padding and a safety margin
      return Math.ceil((28 + 24 + rows * tile) * 1.05); // small safety margin
    },
    overscan: VIRTUAL_OVER_SCAN,
  });
  const vItems = virtualizer.getVirtualItems();

  const handleGroupItemClick: MouseEventHandler = (evt) => {
    const targetEl = targetFromEvent(evt.nativeEvent, 'button');
    const emojiInfo = targetEl && getEmojiItemInfo(targetEl);
    if (!emojiInfo) return;

    if (emojiInfo.type === EmojiType.Emoji) {
      onEmojiSelect?.(emojiInfo.data, emojiInfo.shortcode);
      if (!evt.altKey && !evt.shiftKey && addToRecentEmoji) {
        addRecentEmoji(mx, emojiInfo.data);
      }
    }
    if (emojiInfo.type === EmojiType.CustomEmoji) {
      onCustomEmojiSelect?.(emojiInfo.data, emojiInfo.shortcode);
    }
    if (emojiInfo.type === EmojiType.Sticker) {
      onStickerSelect?.(emojiInfo.data, emojiInfo.shortcode, emojiInfo.label);
    }
    if (emojiInfo.type === EmojiType.Gif) {
      const gifDataStr = targetEl.getAttribute('data-gif-data');
      const gifData = gifDataStr ? JSON.parse(gifDataStr) : null;
      const isSpoiler = targetEl.getAttribute('data-gif-spoiler') === 'true';
      onGifSelect?.(gifData, isSpoiler);
    }
    if (!evt.altKey && !evt.shiftKey) requestClose();
  };

  const handleTextCustomEmojiSelect = (textEmoji: string) => {
    onCustomEmojiSelect?.(textEmoji, textEmoji);
    requestClose();
  };

  const handleScrollToGroup = (groupId: string) => {
    const groupIndex = groups.findIndex((group) => group.id === groupId);
    virtualizer.scrollToIndex(groupIndex, { align: 'start' });
  };

  // sync active sidebar tab with scroll
  useEffect(() => {
    const scrollElement = contentScrollRef.current;
    if (scrollElement) {
      const scrollTop = scrollElement.offsetTop + scrollElement.scrollTop;
      const offsetTop = virtualBaseRef.current?.offsetTop ?? 0;
      const inViewVItem = vItems.find((vItem) => scrollTop < offsetTop + vItem.end);

      const group = inViewVItem ? groups[inViewVItem?.index] : undefined;
      setActiveGroupId(group?.id);
    }
  }, [vItems, groups, setActiveGroupId, emojiResult?.query, gifResult?.query]);

  // reset scroll position on search
  useEffect(() => {
    const scrollElement = contentScrollRef.current;
    if (scrollElement) {
      scrollElement.scrollTo({ top: 0 });
    }
  }, [emojiResult?.query, gifResult?.query]);

  // reset scroll position on tab change
  useEffect(() => {
    if (groups.length > 0) {
      virtualizer.scrollToIndex(0, { align: 'start' });
    }
  }, [tab, virtualizer, groups.length]);

  return (
    <FocusTrap
      focusTrapOptions={{
        returnFocusOnDeactivate,
        initialFocus: false,
        onDeactivate: requestClose,

        allowOutsideClick: (e) => {
          e.preventDefault();
          requestClose();
          return false;
        },
        isKeyForward: (evt: KeyboardEvent) =>
          !editableActiveElement() && isKeyHotkey(['arrowdown', 'arrowright'], evt),
        isKeyBackward: (evt: KeyboardEvent) =>
          !editableActiveElement() && isKeyHotkey(['arrowup', 'arrowleft'], evt),
        escapeDeactivates: true,
      }}
    >
      <EmojiBoardLayout
        header={
          <Box direction="Column" gap="200">
            {onTabChange && <EmojiBoardTabs tab={tab} onTabChange={onTabChange} />}
            <SearchInput
              key={tab}
              query={emojiResult?.query}
              onChange={handleOnChange}
              tab={tab}
              allowTextCustomEmoji={allowTextCustomEmoji}
              onTextCustomEmojiSelect={handleTextCustomEmojiSelect}
            />
          </Box>
        }
        sidebar={
          emojiTab ? (
            <EmojiSidebar
              activeGroupAtom={activeGroupIdAtom}
              packs={imagePacks}
              saveStickerEmojiBandwidth={saveStickerEmojiBandwidth}
              onScrollToGroup={handleScrollToGroup}
            />
          ) : (
            !gifTab && (
              <StickerSidebar
                activeGroupAtom={activeGroupIdAtom}
                packs={imagePacks}
                saveStickerEmojiBandwidth={saveStickerEmojiBandwidth}
                onScrollToGroup={handleScrollToGroup}
              />
            )
          )
        }
        isFullWidth={isFullWidth}
      >
        <Box grow="Yes">
          <EmojiGroupHolder
            key={tab}
            contentScrollRef={contentScrollRef}
            previewAtom={previewAtom}
            onGroupItemClick={handleGroupItemClick}
          >
            {tab !== EmojiBoardTab.Gif && searchedItems && (
              <EmojiGroup
                id={SEARCH_GROUP_ID}
                label={searchedItems.length ? 'Search Results' : 'No Results found'}
              >
                {searchedItems.map((element, index) => renderItem(element, index))}
              </EmojiGroup>
            )}
            <div
              ref={virtualBaseRef}
              style={{
                position: 'relative',
                height: virtualizer.getTotalSize(),
              }}
            >
              {vItems.map((vItem) => {
                const group = groups[vItem.index]!;

                return (
                  <VirtualTile
                    virtualItem={vItem}
                    style={{ paddingTop: config.space.S200 }}
                    ref={virtualizer.measureElement}
                    key={vItem.index}
                  >
                    <EmojiGroup key={group.id} id={group.id} label={group.name} isGifGroup={gifTab}>
                      {group.items.map(renderItem)}
                    </EmojiGroup>
                  </VirtualTile>
                );
              })}
            </div>
            {tab === EmojiBoardTab.Sticker && groups.length === 0 && <NoStickerPacks />}
            {gifTab && (
              <GifStatus
                loading={gifsLoading}
                error={gifsError}
                isEmpty={groups.flatMap((v) => v.items.map(() => 'gif')).length === 0}
              />
            )}
          </EmojiGroupHolder>
        </Box>
        {!gifTab && <Preview previewAtom={previewAtom} />}
      </EmojiBoardLayout>
    </FocusTrap>
  );
}
