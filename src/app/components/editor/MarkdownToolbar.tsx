import FocusTrap from 'focus-trap-react';
import type { RectCords } from 'folds';
import { Badge, Box, config, IconButton, Line, Menu, Scroll, Text, Tooltip, toRem } from 'folds';
import { TooltipProvider } from '$components/overlay-stack';
import { PopOut } from '$components/overlay-stack';
import type { MouseEventHandler, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { stopPropagation } from '$utils/keyboard';
import { floatingToolbar } from '$styles/overrides/Composer.css';
import { BLOCK_PREFIXES, INLINE_MARKERS } from './keyboard';
import type { ShortcutId, ShortcutOverrides } from '../../keyboard/shortcuts';
import { formatShortcut, getShortcutBinding } from '../../keyboard/shortcuts';
import * as css from './Editor.css';
import type { ProseMirrorEditorController } from './prosemirrorController';
import {
  CaretDown,
  Code,
  CodeBlock,
  composerIcon,
  EyeSlash,
  sizedIcon,
  ListBullets,
  ListNumbers,
  Quotes,
  TextAa,
  TextB,
  TextHOne,
  TextHThree,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
  TextUnderline,
  type PhosphorIcon,
} from '$components/icons/phosphor';

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

const shortcutLabel = (id: ShortcutId, overrides: ShortcutOverrides) =>
  formatShortcut(getShortcutBinding(id, overrides));

type MarkdownInlineButtonProps = {
  actions: MarkdownEditorActions;
  marker: string;
  icon: PhosphorIcon;
  tooltip: ReactNode;
};

function MarkdownInlineButton({ actions, marker, icon, tooltip }: MarkdownInlineButtonProps) {
  const handleClick = () => {
    actions.applyInline(marker);
    actions.focus();
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
          {sizedIcon(icon, '200')}
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type MarkdownBlockButtonProps = {
  actions: MarkdownEditorActions;
  prefix: string;
  icon: PhosphorIcon;
  tooltip: ReactNode;
};

function MarkdownBlockButton({ actions, prefix, icon, tooltip }: MarkdownBlockButtonProps) {
  const handleClick = () => {
    actions.applyBlock(prefix);
    actions.focus();
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
          {sizedIcon(icon, '200')}
        </IconButton>
      )}
    </TooltipProvider>
  );
}

function MarkdownHeadingButton({ actions }: { actions: MarkdownEditorActions }) {
  const [anchor, setAnchor] = useState<RectCords>();
  const [shortcutOverrides] = useSetting(settingsAtom, 'shortcutOverrides');

  const handleMenuSelect = (prefix: string) => {
    setAnchor(undefined);
    actions.applyBlock(prefix);
    actions.focus();
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
                tooltip={
                  <BtnTooltip
                    text="Heading 1"
                    shortCode={shortcutLabel('composer.heading1', shortcutOverrides)}
                  />
                }
                delay={500}
              >
                {(triggerRef) => (
                  <IconButton
                    ref={triggerRef}
                    onClick={() => handleMenuSelect('# ')}
                    size="400"
                    radii="300"
                  >
                    {sizedIcon(TextHOne, '200')}
                  </IconButton>
                )}
              </TooltipProvider>
              <TooltipProvider
                tooltip={
                  <BtnTooltip
                    text="Heading 2"
                    shortCode={shortcutLabel('composer.heading2', shortcutOverrides)}
                  />
                }
                delay={500}
              >
                {(triggerRef) => (
                  <IconButton
                    ref={triggerRef}
                    onClick={() => handleMenuSelect('## ')}
                    size="400"
                    radii="300"
                  >
                    {sizedIcon(TextHTwo, '200')}
                  </IconButton>
                )}
              </TooltipProvider>
              <TooltipProvider
                tooltip={
                  <BtnTooltip
                    text="Heading 3"
                    shortCode={shortcutLabel('composer.heading3', shortcutOverrides)}
                  />
                }
                delay={500}
              >
                {(triggerRef) => (
                  <IconButton
                    ref={triggerRef}
                    onClick={() => handleMenuSelect('### ')}
                    size="400"
                    radii="300"
                  >
                    {sizedIcon(TextHThree, '200')}
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
        {sizedIcon(TextHOne, '200')}
        {sizedIcon(CaretDown, '200')}
      </IconButton>
    </PopOut>
  );
}

type MarkdownEditorActions = {
  applyBlock: (prefix: string) => void;
  applyInline: (marker: string) => void;
  focus: () => void;
};

function MarkdownToolbar({ actions }: { actions: MarkdownEditorActions }) {
  const [shortcutOverrides] = useSetting(settingsAtom, 'shortcutOverrides');

  return (
    <Box className={`${css.EditorToolbarBase} ${floatingToolbar}`}>
      <Scroll direction="Horizontal" size="0" data-gestures="scroll">
        <Box className={css.EditorToolbar} alignItems="Center" gap="300">
          <Box shrink="No" gap="100">
            <MarkdownInlineButton
              actions={actions}
              marker={INLINE_MARKERS['composer.bold']}
              icon={TextB}
              tooltip={
                <BtnTooltip
                  text="Bold"
                  shortCode={shortcutLabel('composer.bold', shortcutOverrides)}
                />
              }
            />
            <MarkdownInlineButton
              actions={actions}
              marker={INLINE_MARKERS['composer.italic']}
              icon={TextItalic}
              tooltip={
                <BtnTooltip
                  text="Italic"
                  shortCode={shortcutLabel('composer.italic', shortcutOverrides)}
                />
              }
            />
            <MarkdownInlineButton
              actions={actions}
              marker={INLINE_MARKERS['composer.underline']}
              icon={TextUnderline}
              tooltip={
                <BtnTooltip
                  text="Underline"
                  shortCode={shortcutLabel('composer.underline', shortcutOverrides)}
                />
              }
            />
            <MarkdownInlineButton
              actions={actions}
              marker={INLINE_MARKERS['composer.strikethrough']}
              icon={TextStrikethrough}
              tooltip={
                <BtnTooltip
                  text="Strike Through"
                  shortCode={shortcutLabel('composer.strikethrough', shortcutOverrides)}
                />
              }
            />
            <MarkdownInlineButton
              actions={actions}
              marker={INLINE_MARKERS['composer.inlineCode']}
              icon={Code}
              tooltip={
                <BtnTooltip
                  text="Inline Code"
                  shortCode={shortcutLabel('composer.inlineCode', shortcutOverrides)}
                />
              }
            />
            <MarkdownInlineButton
              actions={actions}
              marker={INLINE_MARKERS['composer.spoiler']}
              icon={EyeSlash}
              tooltip={
                <BtnTooltip
                  text="Spoiler"
                  shortCode={shortcutLabel('composer.spoiler', shortcutOverrides)}
                />
              }
            />
          </Box>
          <Line variant="SurfaceVariant" direction="Vertical" style={{ height: toRem(12) }} />
          <Box shrink="No" gap="100">
            <MarkdownBlockButton
              actions={actions}
              prefix={BLOCK_PREFIXES['composer.blockquote']}
              icon={Quotes}
              tooltip={
                <BtnTooltip
                  text="Block Quote"
                  shortCode={shortcutLabel('composer.blockquote', shortcutOverrides)}
                />
              }
            />
            <MarkdownBlockButton
              actions={actions}
              prefix={BLOCK_PREFIXES['composer.codeBlock']}
              icon={CodeBlock}
              tooltip={
                <BtnTooltip
                  text="Block Code"
                  shortCode={shortcutLabel('composer.codeBlock', shortcutOverrides)}
                />
              }
            />
            <MarkdownBlockButton
              actions={actions}
              prefix={BLOCK_PREFIXES['composer.orderedList']}
              icon={ListNumbers}
              tooltip={
                <BtnTooltip
                  text="Ordered List"
                  shortCode={shortcutLabel('composer.orderedList', shortcutOverrides)}
                />
              }
            />
            <MarkdownBlockButton
              actions={actions}
              prefix={BLOCK_PREFIXES['composer.unorderedList']}
              icon={ListBullets}
              tooltip={
                <BtnTooltip
                  text="Unordered List"
                  shortCode={shortcutLabel('composer.unorderedList', shortcutOverrides)}
                />
              }
            />
            <MarkdownHeadingButton actions={actions} />
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
      {composerToolbarOpen ? composerIcon(TextUnderline) : composerIcon(TextAa)}
    </IconButton>
  );
}

export function MarkdownFormattingToolbarBottom({
  controller,
}: {
  controller: ProseMirrorEditorController;
}) {
  const [editorToolbar] = useSetting(settingsAtom, 'editorToolbar');
  const [composerToolbarOpen] = useSetting(settingsAtom, 'composerToolbarOpen');

  if (!editorToolbar || !composerToolbarOpen) return null;

  return (
    <div>
      <Line variant="SurfaceVariant" size="300" />
      <MarkdownToolbar
        actions={{
          applyInline: (marker) => controller.applyMarkdownInline(marker),
          applyBlock: (prefix) => controller.applyMarkdownBlockPrefix(prefix),
          focus: () => controller.focus(),
        }}
      />
    </div>
  );
}
