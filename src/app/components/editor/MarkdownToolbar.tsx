import FocusTrap from 'focus-trap-react';
import type { IconSrc, RectCords } from 'folds';
import {
  Badge,
  Box,
  config,
  Icon,
  IconButton,
  Icons,
  Line,
  Menu,
  PopOut,
  Scroll,
  Text,
  Tooltip,
  TooltipProvider,
  toRem,
} from 'folds';
import type { MouseEventHandler, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { ReactEditor, useSlate } from 'slate-react';
import { isMacOS } from '$utils/user-agent';
import { KeySymbol } from '$utils/key-symbol';
import { stopPropagation } from '$utils/keyboard';
import { floatingToolbar } from '$styles/overrides/Composer.css';
import {
  applyMarkdownBlockPrefix,
  applyMarkdownInline,
  BLOCK_HOTKEYS,
  INLINE_HOTKEYS,
} from './keyboard';
import * as css from './Editor.css';

function BtnTooltip({ text, shortCode }: { text: string; shortCode?: string }) {
  return (
    <Tooltip style={{ padding: config.space.S300 }}>
      <Box gap="200" direction="Column" alignItems="Center">
        <Text align="Center">{text}</Text>
        {shortCode && (
          <Badge as="kbd" radii="300" size="500">
            <Text size="T200" align="Center">
              {shortCode}
            </Text>
          </Badge>
        )}
      </Box>
    </Tooltip>
  );
}

type MarkdownInlineButtonProps = {
  marker: string;
  icon: IconSrc;
  tooltip: ReactNode;
};

function MarkdownInlineButton({ marker, icon, tooltip }: MarkdownInlineButtonProps) {
  const editor = useSlate();

  const handleClick = () => {
    applyMarkdownInline(editor, marker);
    ReactEditor.focus(editor);
  };

  return (
    <TooltipProvider tooltip={tooltip} delay={500}>
      {(triggerRef) => (
        <IconButton
          ref={triggerRef}
          variant="SurfaceVariant"
          onClick={handleClick}
          size="400"
          radii="300"
        >
          <Icon size="200" src={icon} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type MarkdownBlockButtonProps = {
  prefix: string;
  icon: IconSrc;
  tooltip: ReactNode;
};

function MarkdownBlockButton({ prefix, icon, tooltip }: MarkdownBlockButtonProps) {
  const editor = useSlate();

  const handleClick = () => {
    applyMarkdownBlockPrefix(editor, prefix);
    ReactEditor.focus(editor);
  };

  return (
    <TooltipProvider tooltip={tooltip} delay={500}>
      {(triggerRef) => (
        <IconButton
          ref={triggerRef}
          variant="SurfaceVariant"
          onClick={handleClick}
          size="400"
          radii="300"
        >
          <Icon size="200" src={icon} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

function MarkdownHeadingButton() {
  const editor = useSlate();
  const [anchor, setAnchor] = useState<RectCords>();
  const modKey = isMacOS() ? KeySymbol.Command : 'Ctrl';

  const handleMenuSelect = (prefix: string) => {
    setAnchor(undefined);
    applyMarkdownBlockPrefix(editor, prefix);
    ReactEditor.focus(editor);
  };

  const handleMenuOpen: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setAnchor(evt.currentTarget.getBoundingClientRect());
  };

  return (
    <PopOut
      anchor={anchor}
      offset={5}
      position="Top"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => setAnchor(undefined),
            clickOutsideDeactivates: true,
            isKeyForward: (evt: KeyboardEvent) =>
              evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
            isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu style={{ padding: config.space.S100 }}>
            <Box gap="100">
              <TooltipProvider
                tooltip={<BtnTooltip text="Heading 1" shortCode={`${modKey} + 1`} />}
                delay={500}
              >
                {(triggerRef) => (
                  <IconButton
                    ref={triggerRef}
                    onClick={() => handleMenuSelect('# ')}
                    size="400"
                    radii="300"
                  >
                    <Icon size="200" src={Icons.Heading1} />
                  </IconButton>
                )}
              </TooltipProvider>
              <TooltipProvider
                tooltip={<BtnTooltip text="Heading 2" shortCode={`${modKey} + 2`} />}
                delay={500}
              >
                {(triggerRef) => (
                  <IconButton
                    ref={triggerRef}
                    onClick={() => handleMenuSelect('## ')}
                    size="400"
                    radii="300"
                  >
                    <Icon size="200" src={Icons.Heading2} />
                  </IconButton>
                )}
              </TooltipProvider>
              <TooltipProvider
                tooltip={<BtnTooltip text="Heading 3" shortCode={`${modKey} + 3`} />}
                delay={500}
              >
                {(triggerRef) => (
                  <IconButton
                    ref={triggerRef}
                    onClick={() => handleMenuSelect('### ')}
                    size="400"
                    radii="300"
                  >
                    <Icon size="200" src={Icons.Heading3} />
                  </IconButton>
                )}
              </TooltipProvider>
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      <IconButton
        style={{ width: 'unset' }}
        variant="SurfaceVariant"
        onClick={handleMenuOpen}
        size="400"
        radii="300"
        aria-haspopup="menu"
        aria-expanded={!!anchor}
      >
        <Icon size="200" src={Icons.Heading1} />
        <Icon size="200" src={Icons.ChevronBottom} />
      </IconButton>
    </PopOut>
  );
}

export function MarkdownToolbar() {
  const modKey = isMacOS() ? KeySymbol.Command : 'Ctrl';

  return (
    <Box className={`${css.EditorToolbarBase} ${floatingToolbar}`}>
      <Scroll direction="Horizontal" size="0">
        <Box className={css.EditorToolbar} alignItems="Center" gap="300">
          <Box shrink="No" gap="100">
            <MarkdownInlineButton
              marker={INLINE_HOTKEYS['mod+b']!}
              icon={Icons.Bold}
              tooltip={<BtnTooltip text="Bold" shortCode={`${modKey} + B`} />}
            />
            <MarkdownInlineButton
              marker={INLINE_HOTKEYS['mod+i']!}
              icon={Icons.Italic}
              tooltip={<BtnTooltip text="Italic" shortCode={`${modKey} + I`} />}
            />
            <MarkdownInlineButton
              marker={INLINE_HOTKEYS['mod+u']!}
              icon={Icons.Underline}
              tooltip={<BtnTooltip text="Underline" shortCode={`${modKey} + U`} />}
            />
            <MarkdownInlineButton
              marker={INLINE_HOTKEYS['mod+s']!}
              icon={Icons.Strike}
              tooltip={<BtnTooltip text="Strike Through" shortCode={`${modKey} + S`} />}
            />
            <MarkdownInlineButton
              marker={INLINE_HOTKEYS['mod+[']!}
              icon={Icons.Code}
              tooltip={<BtnTooltip text="Inline Code" shortCode={`${modKey} + [`} />}
            />
            <MarkdownInlineButton
              marker={INLINE_HOTKEYS['mod+h']!}
              icon={Icons.EyeBlind}
              tooltip={<BtnTooltip text="Spoiler" shortCode={`${modKey} + H`} />}
            />
          </Box>
          <Line variant="SurfaceVariant" direction="Vertical" style={{ height: toRem(12) }} />
          <Box shrink="No" gap="100">
            <MarkdownBlockButton
              prefix={BLOCK_HOTKEYS["mod+'"]!}
              icon={Icons.BlockQuote}
              tooltip={<BtnTooltip text="Block Quote" shortCode={`${modKey} + '`} />}
            />
            <MarkdownBlockButton
              prefix={BLOCK_HOTKEYS['mod+;']!}
              icon={Icons.BlockCode}
              tooltip={<BtnTooltip text="Block Code" shortCode={`${modKey} + ;`} />}
            />
            <MarkdownBlockButton
              prefix={BLOCK_HOTKEYS['mod+7']!}
              icon={Icons.OrderList}
              tooltip={<BtnTooltip text="Ordered List" shortCode={`${modKey} + 7`} />}
            />
            <MarkdownBlockButton
              prefix={BLOCK_HOTKEYS['mod+8']!}
              icon={Icons.UnorderList}
              tooltip={<BtnTooltip text="Unordered List" shortCode={`${modKey} + 8`} />}
            />
            <MarkdownHeadingButton />
          </Box>
        </Box>
      </Scroll>
    </Box>
  );
}

export type MarkdownFormattingToolbarToggleVariant = 'SurfaceVariant' | 'Background';

export function MarkdownFormattingToolbarToggle({
  variant,
}: {
  variant: MarkdownFormattingToolbarToggleVariant;
}) {
  const [editorToolbar] = useSetting(settingsAtom, 'editorToolbar');
  const [composerToolbarOpen, setComposerToolbarOpen] = useSetting(
    settingsAtom,
    'composerToolbarOpen'
  );

  useEffect(() => {
    if (!editorToolbar) setComposerToolbarOpen(false);
  }, [editorToolbar, setComposerToolbarOpen]);

  if (!editorToolbar) return null;

  return (
    <IconButton
      variant={variant}
      size="300"
      radii="300"
      title={composerToolbarOpen ? 'Hide formatting toolbar' : 'Show formatting toolbar'}
      aria-pressed={composerToolbarOpen}
      aria-label={composerToolbarOpen ? 'Hide formatting toolbar' : 'Show formatting toolbar'}
      onClick={() => setComposerToolbarOpen(!composerToolbarOpen)}
    >
      <Icon src={composerToolbarOpen ? Icons.AlphabetUnderline : Icons.Alphabet} />
    </IconButton>
  );
}

export function MarkdownFormattingToolbarBottom() {
  const [editorToolbar] = useSetting(settingsAtom, 'editorToolbar');
  const [composerToolbarOpen] = useSetting(settingsAtom, 'composerToolbarOpen');

  if (!editorToolbar || !composerToolbarOpen) return null;

  return (
    <div>
      <Line variant="SurfaceVariant" size="300" />
      <MarkdownToolbar />
    </div>
  );
}
