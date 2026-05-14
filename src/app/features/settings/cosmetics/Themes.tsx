import type { ChangeEventHandler, KeyboardEventHandler } from 'react';
import { type MouseEventHandler, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  config,
  Icon,
  Icons,
  Input,
  Menu,
  MenuItem,
  PopOut,
  Switch,
  Text,
  toRem,
  type RectCords,
} from 'folds';
import { isKeyHotkey } from 'is-hotkey';

import { SettingMenuSelector } from '$components/setting-menu-selector';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import {
  DEFAULT_ARBORIUM_DARK_THEME,
  DEFAULT_ARBORIUM_LIGHT_THEME,
  getArboriumThemeLabel,
  getArboriumThemeOptions,
} from '$plugins/arborium';
import { ThemeKind, useActiveTheme } from '$hooks/useTheme';
import { useSetting } from '$state/hooks/settings';
import type { ShowRoomIcon } from '$state/settings';
import { settingsAtom } from '$state/settings';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { ThemeAppearanceSection } from './ThemeAppearanceSection';
import { stopPropagation } from '$utils/keyboard';
import FocusTrap from 'focus-trap-react';
import { useShowRoomIcon } from '$hooks/useShowRoomIcon';
import type { PanelSizetItem } from '$hooks/usePanelSizes';
import { usePanelSizeItems } from '$hooks/usePanelSizes';

const clampIncomingInlineImageHeight = (n: number) => Math.max(1, Math.min(4096, n));

function makeArboriumThemeOptions(kind?: 'light' | 'dark') {
  const themes = kind
    ? getArboriumThemeOptions(kind)
    : [...getArboriumThemeOptions('light'), ...getArboriumThemeOptions('dark')];

  return themes.map((theme) => ({
    value: theme.id,
    label: getArboriumThemeLabel(theme.id),
  }));
}

function ThemeTrigger({
  selectedLabel,
  onClick,
  active,
  disabled,
}: {
  selectedLabel: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  active: boolean;
  disabled?: boolean;
}) {
  return (
    <Chip
      type="button"
      variant={active ? 'Primary' : 'Secondary'}
      outlined={active}
      radii="Pill"
      after={<Icon size="200" src={Icons.ChevronBottom} />}
      onClick={onClick}
      disabled={disabled}
    >
      <Text size="B300">{selectedLabel}</Text>
    </Chip>
  );
}

function SelectCodeBlockTheme({ disabled }: Readonly<{ disabled?: boolean }>) {
  const activeTheme = useActiveTheme();
  const [arboriumThemeId, setArboriumThemeId] = useSetting(settingsAtom, 'arboriumThemeId');
  const [arboriumLightTheme] = useSetting(settingsAtom, 'arboriumLightTheme');
  const [arboriumDarkTheme] = useSetting(settingsAtom, 'arboriumDarkTheme');

  const arboriumThemeOptions = makeArboriumThemeOptions();
  const selectedSystemThemeId =
    activeTheme.kind === ThemeKind.Dark
      ? (makeArboriumThemeOptions('dark').find((theme) => theme.value === arboriumDarkTheme)
          ?.value ?? DEFAULT_ARBORIUM_DARK_THEME)
      : (makeArboriumThemeOptions('light').find((theme) => theme.value === arboriumLightTheme)
          ?.value ?? DEFAULT_ARBORIUM_LIGHT_THEME);
  const selectedArboriumThemeId =
    arboriumThemeOptions.find((theme) => theme.value === arboriumThemeId)?.value ??
    selectedSystemThemeId;

  return (
    <SettingMenuSelector
      value={selectedArboriumThemeId}
      options={arboriumThemeOptions}
      onSelect={setArboriumThemeId}
      disabled={disabled}
    />
  );
}

function CodeBlockSystemThemePreferences() {
  const activeTheme = useActiveTheme();
  const [arboriumLightTheme, setArboriumLightTheme] = useSetting(
    settingsAtom,
    'arboriumLightTheme'
  );
  const [arboriumDarkTheme, setArboriumDarkTheme] = useSetting(settingsAtom, 'arboriumDarkTheme');

  const arboriumLightThemeOptions = makeArboriumThemeOptions('light');
  const arboriumDarkThemeOptions = makeArboriumThemeOptions('dark');
  const selectedArboriumLightTheme =
    arboriumLightThemeOptions.find((theme) => theme.value === arboriumLightTheme)?.value ??
    DEFAULT_ARBORIUM_LIGHT_THEME;
  const selectedArboriumDarkTheme =
    arboriumDarkThemeOptions.find((theme) => theme.value === arboriumDarkTheme)?.value ??
    DEFAULT_ARBORIUM_DARK_THEME;

  return (
    <Box wrap="Wrap" gap="400">
      <SettingTile
        title="Light Theme:"
        focusId="code-block-light-theme"
        after={
          <SettingMenuSelector
            value={selectedArboriumLightTheme}
            options={arboriumLightThemeOptions}
            onSelect={setArboriumLightTheme}
            renderTrigger={({ selectedOption, openMenu, disabled }) => (
              <ThemeTrigger
                selectedLabel={selectedOption.label}
                onClick={openMenu}
                active={activeTheme.kind === ThemeKind.Light}
                disabled={disabled}
              />
            )}
          />
        }
      />
      <SettingTile
        title="Dark Theme:"
        focusId="code-block-dark-theme"
        after={
          <SettingMenuSelector
            value={selectedArboriumDarkTheme}
            options={arboriumDarkThemeOptions}
            onSelect={setArboriumDarkTheme}
            renderTrigger={({ selectedOption, openMenu, disabled }) => (
              <ThemeTrigger
                selectedLabel={selectedOption.label}
                onClick={openMenu}
                active={activeTheme.kind === ThemeKind.Dark}
                disabled={disabled}
              />
            )}
          />
        }
      />
    </Box>
  );
}

function CodeBlockThemeSettings() {
  const [useSystemArboriumTheme, setUseSystemArboriumTheme] = useSetting(
    settingsAtom,
    'useSystemArboriumTheme'
  );

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Code Block Theme</Text>

      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="System Theme"
          focusId="code-block-system-theme"
          description="Sync highlighted code with the app's active light/dark theme."
          after={
            <Switch
              variant="Primary"
              value={useSystemArboriumTheme}
              onChange={setUseSystemArboriumTheme}
            />
          }
        />
        {useSystemArboriumTheme && <CodeBlockSystemThemePreferences />}
      </SequenceCard>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Manual Theme"
          focusId="code-block-manual-theme"
          description="Active when System Theme is disabled."
          after={<SelectCodeBlockTheme disabled={useSystemArboriumTheme} />}
        />
      </SequenceCard>
    </Box>
  );
}

function ThemeVisualPreferences() {
  const [saturation, setSaturation] = useSetting(settingsAtom, 'saturationLevel');
  const [underlineLinks, setUnderlineLinks] = useSetting(settingsAtom, 'underlineLinks');
  const [reducedMotion, setReducedMotion] = useSetting(settingsAtom, 'reducedMotion');
  const [autoplayGifs, setAutoplayGifs] = useSetting(settingsAtom, 'autoplayGifs');
  const [autoplayStickers, setAutoplayStickers] = useSetting(settingsAtom, 'autoplayStickers');
  const [autoplayEmojis, setAutoplayEmojis] = useSetting(settingsAtom, 'autoplayEmojis');
  const [incomingInlineImagesDefaultHeight, setIncomingInlineImagesDefaultHeight] = useSetting(
    settingsAtom,
    'incomingInlineImagesDefaultHeight'
  );
  const [incomingInlineImagesMaxHeight, setIncomingInlineImagesMaxHeight] = useSetting(
    settingsAtom,
    'incomingInlineImagesMaxHeight'
  );
  const [linkPreviewImageMaxHeight, setLinkPreviewImageMaxHeight] = useSetting(
    settingsAtom,
    'linkPreviewImageMaxHeight'
  );
  const [incomingDefaultHeightInput, setIncomingDefaultHeightInput] = useState(
    incomingInlineImagesDefaultHeight.toString()
  );
  const [incomingMaxHeightInput, setIncomingMaxHeightInput] = useState(
    incomingInlineImagesMaxHeight.toString()
  );
  const [linkPreviewMaxHeightInput, setLinkPreviewMaxHeightInput] = useState(
    linkPreviewImageMaxHeight.toString()
  );
  const [showRoomBanners, setShowRoomBanners] = useSetting(settingsAtom, 'showRoomBanners');

  const handleIncomingDefaultHeightChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const val = evt.target.value;
    setIncomingDefaultHeightInput(val);
    const parsed = Number.parseInt(val, 10);
    if (!Number.isNaN(parsed))
      setIncomingInlineImagesDefaultHeight(clampIncomingInlineImageHeight(parsed));
  };
  const handleIncomingMaxHeightChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const val = evt.target.value;
    setIncomingMaxHeightInput(val);
    const parsed = Number.parseInt(val, 10);
    if (!Number.isNaN(parsed))
      setIncomingInlineImagesMaxHeight(clampIncomingInlineImageHeight(parsed));
  };
  const handleLinkPreviewMaxHeightChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const val = evt.target.value;
    setLinkPreviewMaxHeightInput(val);
    const parsed = Number.parseInt(val, 10);
    if (!Number.isNaN(parsed)) setLinkPreviewImageMaxHeight(clampIncomingInlineImageHeight(parsed));
  };

  const onNumberInputKeyDown =
    (reset: () => void): KeyboardEventHandler<HTMLInputElement> =>
    (evt) => {
      if (isKeyHotkey('escape', evt)) {
        evt.stopPropagation();
        reset();
        (evt.target as HTMLInputElement).blur();
      }
      if (isKeyHotkey('enter', evt)) {
        (evt.target as HTMLInputElement).blur();
      }
    };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Display</Text>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Saturation"
          focusId="saturation"
          description={`${saturation}%`}
          after={
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={saturation}
              onChange={(e) => setSaturation(Number.parseInt(e.target.value, 10))}
              style={{
                width: toRem(160),
                cursor: 'pointer',
                appearance: 'none',
                height: toRem(6),
                borderRadius: config.radii.Pill,
                backgroundColor: 'var(--sable-surface-container-line)',
                accentColor: 'var(--sable-primary-main)',
              }}
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Underline Links"
          focusId="underline-links"
          description="Always show underlines on links in chat, bios and room descriptions."
          after={<Switch variant="Primary" value={underlineLinks} onChange={setUnderlineLinks} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Reduced Motion"
          focusId="reduced-motion"
          description="Stops animations and sliding UI elements."
          after={<Switch variant="Primary" value={reducedMotion} onChange={setReducedMotion} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Autoplay GIFs"
          focusId="autoplay-gifs"
          description="Automatically play animated image uploads and links."
          after={<Switch variant="Primary" value={autoplayGifs} onChange={setAutoplayGifs} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Autoplay Stickers"
          focusId="autoplay-stickers"
          description="Automatically play animated stickers."
          after={
            <Switch variant="Primary" value={autoplayStickers} onChange={setAutoplayStickers} />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Autoplay Emojis"
          focusId="autoplay-emojis"
          description="Automatically play animated custom emojis."
          after={<Switch variant="Primary" value={autoplayEmojis} onChange={setAutoplayEmojis} />}
        />
      </SequenceCard>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Display Room banners"
          focusId="display-room-banners"
          after={<Switch variant="Primary" value={showRoomBanners} onChange={setShowRoomBanners} />}
        />
      </SequenceCard>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Incoming inline images default height"
          focusId="incoming-inline-images-default-height"
          description={`Default height for incoming inline images that don't specify a height.`}
          after={
            <Input
              style={{ width: toRem(100) }}
              variant={
                Number.parseInt(incomingDefaultHeightInput, 10) ===
                incomingInlineImagesDefaultHeight
                  ? 'Secondary'
                  : 'Success'
              }
              size="300"
              radii="300"
              type="number"
              min="1"
              max="4096"
              value={incomingDefaultHeightInput}
              onChange={handleIncomingDefaultHeightChange}
              onKeyDown={onNumberInputKeyDown(() =>
                setIncomingDefaultHeightInput(incomingInlineImagesDefaultHeight.toString())
              )}
              after={<Text size="T300">px</Text>}
              outlined
            />
          }
        />
      </SequenceCard>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Incoming inline images max height"
          focusId="incoming-inline-images-max-height"
          description={`Maximum height for incoming inline images. Any incoming height above this is clamped down.`}
          after={
            <Input
              style={{ width: toRem(100) }}
              variant={
                Number.parseInt(incomingMaxHeightInput, 10) === incomingInlineImagesMaxHeight
                  ? 'Secondary'
                  : 'Success'
              }
              size="300"
              radii="300"
              type="number"
              min="1"
              max="4096"
              value={incomingMaxHeightInput}
              onChange={handleIncomingMaxHeightChange}
              onKeyDown={onNumberInputKeyDown(() =>
                setIncomingMaxHeightInput(incomingInlineImagesMaxHeight.toString())
              )}
              after={<Text size="T300">px</Text>}
              outlined
            />
          }
        />
      </SequenceCard>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Link preview image max height"
          focusId="link-preview-image-max-height"
          description="Maximum height for URL / Open Graph preview media (image or playable og:video), including bundled previews."
          after={
            <Input
              style={{ width: toRem(100) }}
              variant={
                Number.parseInt(linkPreviewMaxHeightInput, 10) === linkPreviewImageMaxHeight
                  ? 'Secondary'
                  : 'Success'
              }
              size="300"
              radii="300"
              type="number"
              min="1"
              max="4096"
              value={linkPreviewMaxHeightInput}
              onChange={handleLinkPreviewMaxHeightChange}
              onKeyDown={onNumberInputKeyDown(() =>
                setLinkPreviewMaxHeightInput(linkPreviewImageMaxHeight.toString())
              )}
              after={<Text size="T300">px</Text>}
              outlined
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}

function SubnestedSpaceLinkDepthInput() {
  const [subspaceHierarchyLimit, setSubspaceHierarchyLimit] = useSetting(
    settingsAtom,
    'subspaceHierarchyLimit'
  );
  const [inputValue, setInputValue] = useState(subspaceHierarchyLimit.toString());

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const val = evt.target.value;
    setInputValue(val);

    const parsed = parseInt(val, 10);
    if (!Number.isNaN(parsed) && parsed >= 2 && parsed <= 10) {
      setSubspaceHierarchyLimit(parsed);
    }
  };

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (evt) => {
    if (isKeyHotkey('escape', evt)) {
      evt.stopPropagation();
      setInputValue(subspaceHierarchyLimit.toString());
      (evt.target as HTMLInputElement).blur();
    }

    if (isKeyHotkey('enter', evt)) {
      (evt.target as HTMLInputElement).blur();
    }
  };

  return (
    <Input
      style={{ width: toRem(80) }}
      variant={parseInt(inputValue, 10) === subspaceHierarchyLimit ? 'Secondary' : 'Success'}
      size="300"
      radii="300"
      type="number"
      min="1"
      max="10"
      value={inputValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      outlined
    />
  );
}

function PageZoomInput() {
  const [pageZoom, setPageZoom] = useSetting(settingsAtom, 'pageZoom');
  const [currentZoom, setCurrentZoom] = useState(`${pageZoom}`);

  const handleZoomChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    setCurrentZoom(evt.target.value);
  };

  const handleZoomEnter: KeyboardEventHandler<HTMLInputElement> = (evt) => {
    if (isKeyHotkey('escape', evt)) {
      evt.stopPropagation();
      setCurrentZoom(pageZoom.toString());
    }
    if (
      isKeyHotkey('enter', evt) &&
      'value' in evt.target &&
      typeof evt.target.value === 'string'
    ) {
      const newZoom = Number.parseInt(evt.target.value, 10);
      if (Number.isNaN(newZoom)) return;
      const safeZoom = Math.max(Math.min(newZoom, 150), 75);
      setPageZoom(safeZoom);
      setCurrentZoom(safeZoom.toString());
    }
  };

  return (
    <Input
      style={{ width: toRem(100) }}
      variant={pageZoom === Number.parseInt(currentZoom, 10) ? 'Secondary' : 'Success'}
      size="300"
      radii="300"
      type="number"
      min="75"
      max="150"
      value={currentZoom}
      onChange={handleZoomChange}
      onKeyDown={handleZoomEnter}
      after={<Text size="T300">%</Text>}
      outlined
    />
  );
}

function PanelSelector({
  sidebarSelector,
  setSidebarSelector,
}: {
  sidebarSelector: string;
  setSidebarSelector: (arg0: string) => void;
}) {
  const [menuCords, setMenuCords] = useState<RectCords>();
  const panelSizeItems = usePanelSizeItems();

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSelect = (position: PanelSizetItem) => {
    setSidebarSelector(position.layout);
    setMenuCords(undefined);
  };

  return (
    <>
      <Button
        size="300"
        variant="Secondary"
        outlined
        fill="Soft"
        radii="300"
        after={<Icon size="300" src={Icons.ChevronBottom} />}
        onClick={handleMenu}
      >
        <Text size="T300">
          {panelSizeItems.find((i) => i.layout === sidebarSelector)?.name ?? sidebarSelector}
        </Text>
      </Button>
      <PopOut
        anchor={menuCords}
        offset={5}
        position="Bottom"
        align="End"
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: () => setMenuCords(undefined),
              clickOutsideDeactivates: true,
              isKeyForward: (evt: KeyboardEvent) =>
                evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
              isKeyBackward: (evt: KeyboardEvent) =>
                evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu>
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                {panelSizeItems.map((item) => (
                  <MenuItem
                    key={item.layout}
                    size="300"
                    variant={sidebarSelector === item.layout ? 'Primary' : 'Surface'}
                    radii="300"
                    onClick={() => handleSelect(item)}
                  >
                    <Text size="T300">{item.name}</Text>
                  </MenuItem>
                ))}
              </Box>
            </Menu>
          </FocusTrap>
        }
      />
    </>
  );
}
function SidebarWidth({ sidebarSelector }: { sidebarSelector: string }) {
  const [roomSidebarWidth, setRoomSidebarWidth] = useSetting(settingsAtom, 'roomSidebarWidth');
  const [memberSidebarWidth, setMemberSidebarWidth] = useSetting(
    settingsAtom,
    'memberSidebarWidth'
  );
  const [threadSidebarWidth, setThreadSidebarWidth] = useSetting(
    settingsAtom,
    'threadSidebarWidth'
  );
  const [threadRootHeight, setThreadRootHeight] = useSetting(settingsAtom, 'threadRootHeight');
  const [vcmsgSidebarWidth, setvcmsgSidebarWidth] = useSetting(settingsAtom, 'vcmsgSidebarWidth');
  const [widgetSidebarWidth, setWidgetSidebarWidth] = useSetting(
    settingsAtom,
    'widgetSidebarWidth'
  );
  const [roomBannerHeight, setRoomBannerHeight] = useSetting(settingsAtom, 'roomBannerHeight');

  // Yandere style code but it works  and is as straight forward as can be :shrug:
  const getCurValue = useMemo(() => {
    if (sidebarSelector === 'roomSidebarWidth') return roomSidebarWidth;
    if (sidebarSelector === 'memberSidebarWidth') return memberSidebarWidth;
    if (sidebarSelector === 'threadSidebarWidth') return threadSidebarWidth;
    if (sidebarSelector === 'threadRootHeight') return threadRootHeight;
    if (sidebarSelector === 'vcmsgSidebarWidth') return vcmsgSidebarWidth;
    if (sidebarSelector === 'widgetSidebarWidth') return widgetSidebarWidth;
    if (sidebarSelector === 'roomBannerHeight') return roomBannerHeight;
    return undefined;
  }, [
    sidebarSelector,
    roomSidebarWidth,
    memberSidebarWidth,
    threadSidebarWidth,
    threadRootHeight,
    vcmsgSidebarWidth,
    widgetSidebarWidth,
    roomBannerHeight,
  ]);
  const [curValue, setCurValue] = useState(getCurValue);
  const setValue = (value: number) => {
    if (sidebarSelector === 'roomSidebarWidth') setRoomSidebarWidth(value);
    if (sidebarSelector === 'memberSidebarWidth') setMemberSidebarWidth(value);
    if (sidebarSelector === 'threadSidebarWidth') setThreadSidebarWidth(value);
    if (sidebarSelector === 'threadRootHeight') setThreadRootHeight(value);
    if (sidebarSelector === 'vcmsgSidebarWidth') setvcmsgSidebarWidth(value);
    if (sidebarSelector === 'widgetSidebarWidth') setWidgetSidebarWidth(value);
    if (sidebarSelector === 'roomBannerHeight') setRoomBannerHeight(value);
  };

  useEffect(() => {
    setInputValue(curValue?.toString());
  }, [curValue]);
  useEffect(() => {
    setCurValue(getCurValue);
  }, [getCurValue]);

  const [inputValue, setInputValue] = useState(curValue?.toString());

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const val = evt.target.value;
    setInputValue(val);

    const parsed = parseInt(val, 10);
    if (!Number.isNaN(parsed)) {
      setValue(parsed);
    }
  };

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (evt) => {
    if (isKeyHotkey('escape', evt)) {
      evt.stopPropagation();
      setInputValue(curValue?.toString());
      (evt.target as HTMLInputElement).blur();
    }

    if (isKeyHotkey('enter', evt)) {
      (evt.target as HTMLInputElement).blur();
    }
  };

  return (
    <Input
      style={{ width: toRem(80) }}
      variant={parseInt(inputValue ?? '', 10) === curValue ? 'Secondary' : 'Success'}
      size="300"
      radii="300"
      type="number"
      min="0"
      max="1000"
      value={inputValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      outlined
    />
  );
}

function SelectShowRoomIcon() {
  const [menuCords, setMenuCords] = useState<RectCords>();
  const [showRoomIcon, setShowRoomIcon] = useSetting(settingsAtom, 'showRoomIcon');
  const showRoomIconItems = useShowRoomIcon();

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSelect = (position: ShowRoomIcon) => {
    setShowRoomIcon(position);
    setMenuCords(undefined);
  };

  return (
    <>
      <Button
        size="300"
        variant="Secondary"
        outlined
        fill="Soft"
        radii="300"
        after={<Icon size="300" src={Icons.ChevronBottom} />}
        onClick={handleMenu}
      >
        <Text size="T300">
          {showRoomIconItems.find((i) => i.layout === showRoomIcon)?.name ?? showRoomIcon}
        </Text>
      </Button>
      <PopOut
        anchor={menuCords}
        offset={5}
        position="Bottom"
        align="End"
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: () => setMenuCords(undefined),
              clickOutsideDeactivates: true,
              isKeyForward: (evt: KeyboardEvent) =>
                evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
              isKeyBackward: (evt: KeyboardEvent) =>
                evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu>
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                {showRoomIconItems.map((item) => (
                  <MenuItem
                    key={item.layout}
                    size="300"
                    variant={showRoomIcon === item.layout ? 'Primary' : 'Surface'}
                    radii="300"
                    onClick={() => handleSelect(item.layout)}
                  >
                    <Text size="T300">{item.name}</Text>
                  </MenuItem>
                ))}
              </Box>
            </Menu>
          </FocusTrap>
        }
      />
    </>
  );
}
export function Appearance({
  onThemeBrowserOpenChange,
}: {
  onThemeBrowserOpenChange?: (open: boolean) => void;
} = {}) {
  const [sidebarSelector, setSidebarSelector] = useState('roomSidebarWidth');
  const [twitterEmoji, setTwitterEmoji] = useSetting(settingsAtom, 'twitterEmoji');
  const [customDMCards, setCustomDMCards] = useSetting(settingsAtom, 'customDMCards');
  const [showEasterEggs, setShowEasterEggs] = useSetting(settingsAtom, 'showEasterEggs');
  const [themeBrowserOpen, setThemeBrowserOpen] = useState(false);
  const [closeFoldersByDefault, setCloseFoldersByDefault] = useSetting(
    settingsAtom,
    'closeFoldersByDefault'
  );

  return (
    <Box direction="Column" gap="700">
      <ThemeAppearanceSection
        onBrowseOpenChange={(open) => {
          setThemeBrowserOpen(open);
          onThemeBrowserOpenChange?.(open);
        }}
      />
      {!themeBrowserOpen && (
        <>
          <ThemeVisualPreferences />
          <CodeBlockThemeSettings />

          <Box direction="Column" gap="100">
            <Text size="L400">Visual Tweaks</Text>

            <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
              <SettingTile
                title="Twitter Emoji"
                focusId="twitter-emoji"
                description="Use Twitter-style emojis instead of system native ones."
                after={<Switch variant="Primary" value={twitterEmoji} onChange={setTwitterEmoji} />}
              />
            </SequenceCard>

            <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
              <SettingTile
                title="Close Space Folders by Default"
                focusId="collapse-folders-by-default"
                description="Collapse sidebar folders upon loading."
                after={
                  <Switch
                    variant="Primary"
                    value={closeFoldersByDefault}
                    onChange={setCloseFoldersByDefault}
                  />
                }
              />
            </SequenceCard>

            <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
              <SettingTile
                title="Customize DM cards"
                focusId="customize-dm-cards"
                description="Show a custom DM card instead of the DM-ed's details"
                after={
                  <Switch variant="Primary" value={customDMCards} onChange={setCustomDMCards} />
                }
              />
            </SequenceCard>

            <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
              <SettingTile
                title="Show Easter Eggs"
                focusId="show-easter-eggs"
                description="Lets the interface keep a little mischief turned on."
                after={
                  <Switch variant="Primary" value={showEasterEggs} onChange={setShowEasterEggs} />
                }
              />
            </SequenceCard>

            <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
              <SettingTile title="Page Zoom" focusId="page-zoom" after={<PageZoomInput />} />
            </SequenceCard>

            <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
              <SettingTile
                title="Subspace Hierarchy Limit"
                focusId="subspace-hierarchy-limit"
                description="The maximum nesting depth for Subspaces in the sidebar. Once this limit is reached, deeper Subspaces appear as links instead of nested folders."
                after={<SubnestedSpaceLinkDepthInput />}
              />
            </SequenceCard>

            <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
              <SettingTile
                title="Show Room Icons"
                focusId="show-room-icons"
                description="When do you want to show the specific room icons in the sidebar as opposed to the default room icons?"
                after={<SelectShowRoomIcon />}
              />
            </SequenceCard>

            <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
              <SettingTile
                title="Sidebar Size"
                focusId="sidebar-size"
                description="The Size of the sidebar, it can be changed either here numerically or by hovering and dragging the lighting bar"
                after={
                  <>
                    <PanelSelector
                      sidebarSelector={sidebarSelector}
                      setSidebarSelector={setSidebarSelector}
                    />
                    <SidebarWidth sidebarSelector={sidebarSelector} />
                  </>
                }
              />
            </SequenceCard>
          </Box>
        </>
      )}
    </Box>
  );
}
