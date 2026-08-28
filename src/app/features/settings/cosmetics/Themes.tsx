import type { ChangeEventHandler, KeyboardEventHandler } from 'react';
import { type MouseEventHandler, useEffect, useMemo, useState } from 'react';
import { Box, Chip, Input, Switch, Text, toRem } from 'folds';
import { CaretDown, menuIcon } from '$components/icons/phosphor';
import { isKeyHotkey } from 'is-hotkey';

import {
  PANEL_SIZE_OPTIONS,
  SHOW_ROOM_ICON_OPTIONS,
  SettingMenuSelector,
  type PanelSizeKey,
  type SettingMenuOption,
} from '$components/setting-menu-selector';
import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import { SettingTile, SettingToggle } from '$components/setting-tile';
import {
  DEFAULT_ARBORIUM_DARK_THEME,
  DEFAULT_ARBORIUM_LIGHT_THEME,
  getArboriumThemeLabel,
  getArboriumThemeOptions,
} from '$plugins/arborium';
import { ThemeKind, useActiveTheme } from '$hooks/useTheme';
import { useSetting } from '$state/hooks/settings';
import type { PixelatedImageRenderingMode } from '$state/settings';
import { ShowRoomIcon } from '$state/settings';
import { settingsAtom } from '$state/settings';
import { ThemeAppearanceSection } from './ThemeAppearanceSection';
import { SelectShowPerRoomRoomIcon } from '$features/common-settings/appearance/Appearance';

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
      after={menuIcon(CaretDown)}
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

function ThemeVisualPreferences() {
  const [oldSidebar, setOldSidebar] = useSetting(settingsAtom, 'oldSidebar');
  const [pixelatedImageRendering, setPixelatedImageRendering] = useSetting(
    settingsAtom,
    'pixelatedImageRendering'
  );
  const pixelatedImageRenderingOptions: SettingMenuOption<PixelatedImageRenderingMode>[] = [
    { value: 'always', label: 'Always' },
    { value: 'smart', label: 'Smart' },
    { value: 'never', label: 'never' },
  ];
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

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Display</Text>

      <SettingToggle
        title="Go back to old sidebar"
        focusId="old-sidebar"
        description="Reset the sidebar to its old style"
        value={oldSidebar}
        onChange={setOldSidebar}
      />
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Pixelated image scaling"
          focusId="pixelated-image-rendering"
          description="Use crisp nearest-neighbor scaling where selected. Improves pixel art but makes normal images worse."
          after={
            <SettingMenuSelector
              value={pixelatedImageRendering}
              options={pixelatedImageRenderingOptions}
              onSelect={setPixelatedImageRendering}
            />
          }
        />
      </SequenceCard>
      <SettingToggle
        title="Display Room banners"
        focusId="display-room-banners"
        value={showRoomBanners}
        onChange={setShowRoomBanners}
      />

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
  sidebarSelector: PanelSizeKey;
  setSidebarSelector: (key: PanelSizeKey) => void;
}) {
  return (
    <SettingMenuSelector
      value={sidebarSelector}
      options={PANEL_SIZE_OPTIONS}
      onSelect={setSidebarSelector}
    />
  );
}
function SidebarWidth({ sidebarSelector }: { sidebarSelector: PanelSizeKey }) {
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
  const [showRoomIcon, setShowRoomIcon] = useSetting(settingsAtom, 'showRoomIcon');

  return (
    <SettingMenuSelector
      value={showRoomIcon}
      options={SHOW_ROOM_ICON_OPTIONS}
      onSelect={setShowRoomIcon}
    />
  );
}
export function Appearance({
  onThemeBrowserOpenChange,
}: {
  onThemeBrowserOpenChange?: (open: boolean) => void;
} = {}) {
  const [sidebarSelector, setSidebarSelector] = useState<PanelSizeKey>('roomSidebarWidth');
  const [twitterEmoji, setTwitterEmoji] = useSetting(settingsAtom, 'twitterEmoji');
  const [customDMCards, setCustomDMCards] = useSetting(settingsAtom, 'customDMCards');
  const [showEasterEggs, setShowEasterEggs] = useSetting(settingsAtom, 'showEasterEggs');
  const [showRoomIcon] = useSetting(settingsAtom, 'showRoomIcon');
  const [themeBrowserOpen, setThemeBrowserOpen] = useState(false);
  const [closeFoldersByDefault, setCloseFoldersByDefault] = useSetting(
    settingsAtom,
    'closeFoldersByDefault'
  );
  const [roomIconOverlay, setRoomIconOverlay] = useSetting(settingsAtom, 'roomIconOverlay');

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

            <SettingToggle
              title="Twitter Emoji"
              focusId="twitter-emoji"
              description="Use Twitter-style emojis instead of system native ones."
              value={twitterEmoji}
              onChange={setTwitterEmoji}
            />

            <SettingToggle
              title="Close Space Folders by Default"
              focusId="collapse-folders-by-default"
              description="Collapse sidebar folders upon loading."
              value={closeFoldersByDefault}
              onChange={setCloseFoldersByDefault}
            />

            <SettingToggle
              title="Customize DM cards"
              focusId="customize-dm-cards"
              description="Show a custom DM card instead of the DM-ed's details"
              value={customDMCards}
              onChange={setCustomDMCards}
            />

            <SettingToggle
              title="Allow Whimsy"
              focusId="show-easter-eggs"
              description="Lets the interface keep a little mischief turned on."
              value={showEasterEggs}
              onChange={setShowEasterEggs}
            />

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

            <SettingToggle
              title="Overlay Room Privacy Icons"
              focusId="room-icon-overlay"
              description="When enabled, public and private rooms show a globe or lock badge over the room hash icon in the sidebar. When disabled, show the globe or lock icon alone."
              value={roomIconOverlay}
              onChange={setRoomIconOverlay}
            />

            <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
              <SettingTile
                title="Show Room Icons In Sidebars"
                focusId="show-room-icons"
                description={
                  <>
                    <Text size="T200">
                      When do you want to show the specific room icons in the sidebar?
                    </Text>
                    {(showRoomIcon === ShowRoomIcon.Always &&
                      'Always show icons, and fallback to initials') ||
                      (showRoomIcon === ShowRoomIcon.Strict &&
                        'Show icons when available, but fallback to hashes') ||
                      (showRoomIcon === ShowRoomIcon.Smart &&
                        'Show icons only when sidebar is minimized, else icons.') ||
                      (showRoomIcon === ShowRoomIcon.Never &&
                        'Never show icons, always only the hashes.') ||
                      ''}
                    <span style={{ opacity: '50%' }}>{' (current)'}</span>
                  </>
                }
                after={<SelectShowRoomIcon />}
              />
            </SequenceCard>
            {/*THIS SHOULD BE MOVED TO A NEW SETTINGS MENU INSIDE OF THE HOME SETTINGS AS SOON AS THERE IS A REASON TO CREATE A HOME MENU SETTINGS PANEL
              it is currently here because it would be eerie to have an entire home settings menu for just one single setting*/}
            <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
              <SettingTile
                title="Show Room Icons In Home menu sidebar"
                focusId="show-room-home-icons"
                description="Show Room icons in the home menu? (overrides setting above if set)"
                after={<SelectShowPerRoomRoomIcon roomId={'Home'} />}
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
