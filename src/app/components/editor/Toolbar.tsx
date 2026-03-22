import FocusTrap from 'focus-trap-react';
import {
  Badge,
  Box,
  config,
  IconButton,
  Line,
  Menu,
  PopOut,
  RectCords,
  Scroll,
  Text,
  Tooltip,
  TooltipProvider,
  toRem,
} from 'folds';
import { MouseEventHandler, ReactNode, useState, ComponentType } from 'react';
import { ReactEditor, useSlate } from 'slate-react';
import type { IconProps } from '@phosphor-icons/react';
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
import { CodeIcon } from '@phosphor-icons/react/dist/csr/Code';
import { CodeBlockIcon } from '@phosphor-icons/react/dist/csr/CodeBlock';
import { EyeSlashIcon } from '@phosphor-icons/react/dist/csr/EyeSlash';
import { ListBulletsIcon } from '@phosphor-icons/react/dist/csr/ListBullets';
import { ListNumbersIcon } from '@phosphor-icons/react/dist/csr/ListNumbers';
import { MarkdownLogoIcon } from '@phosphor-icons/react/dist/csr/MarkdownLogo';
import { QuotesIcon } from '@phosphor-icons/react/dist/csr/Quotes';
import { TextBIcon } from '@phosphor-icons/react/dist/csr/TextB';
import { TextHOneIcon } from '@phosphor-icons/react/dist/csr/TextHOne';
import { TextHThreeIcon } from '@phosphor-icons/react/dist/csr/TextHThree';
import { TextHTwoIcon } from '@phosphor-icons/react/dist/csr/TextHTwo';
import { TextItalicIcon } from '@phosphor-icons/react/dist/csr/TextItalic';
import { TextStrikethroughIcon } from '@phosphor-icons/react/dist/csr/TextStrikethrough';
import { TextUnderlineIcon } from '@phosphor-icons/react/dist/csr/TextUnderline';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { isMacOS } from '$utils/user-agent';
import { KeySymbol } from '$utils/key-symbol';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { stopPropagation } from '$utils/keyboard';
import { floatingToolbar } from '$styles/overrides/Composer.css';
import { PhosphorIcon } from '$components/PhosphorIcon';
import { HeadingLevel } from './slate';
import { BlockType, MarkType } from './types';
import * as css from './Editor.css';
import {
  headingLevel,
  isAnyMarkActive,
  isBlockActive,
  isMarkActive,
  removeAllMark,
  toggleBlock,
  toggleMark,
} from './utils';

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

type MarkButtonProps = { format: MarkType; icon: ComponentType<IconProps>; tooltip: ReactNode };
export function MarkButton({ format, icon, tooltip }: MarkButtonProps) {
  const editor = useSlate();
  const disableInline = isBlockActive(editor, BlockType.CodeBlock);

  if (disableInline) {
    removeAllMark(editor);
  }

  const handleClick = () => {
    toggleMark(editor, format);
    ReactEditor.focus(editor);
  };

  return (
    <TooltipProvider tooltip={tooltip} delay={500}>
      {(triggerRef) => (
        <IconButton
          ref={triggerRef}
          variant="SurfaceVariant"
          onClick={handleClick}
          aria-pressed={isMarkActive(editor, format)}
          size="400"
          radii="300"
          disabled={disableInline}
        >
          <PhosphorIcon size="200" as={icon} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type BlockButtonProps = {
  format: BlockType;
  icon: ComponentType<IconProps>;
  tooltip: ReactNode;
};
export function BlockButton({ format, icon, tooltip }: BlockButtonProps) {
  const editor = useSlate();

  const handleClick = () => {
    toggleBlock(editor, format, { level: 1 });
    ReactEditor.focus(editor);
  };

  return (
    <TooltipProvider tooltip={tooltip} delay={500}>
      {(triggerRef) => (
        <IconButton
          ref={triggerRef}
          variant="SurfaceVariant"
          onClick={handleClick}
          aria-pressed={isBlockActive(editor, format)}
          size="400"
          radii="300"
        >
          <PhosphorIcon size="200" as={icon} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

const headingIcons: Record<HeadingLevel, ComponentType<IconProps>> = {
  1: TextHOneIcon,
  2: TextHTwoIcon,
  3: TextHThreeIcon,
};

export function HeadingBlockButton() {
  const editor = useSlate();
  const level = headingLevel(editor);
  const [anchor, setAnchor] = useState<RectCords>();
  const isActive = isBlockActive(editor, BlockType.Heading);
  const modKey = isMacOS() ? KeySymbol.Command : 'Ctrl';

  const handleMenuSelect = (selectedLevel: HeadingLevel) => {
    setAnchor(undefined);
    toggleBlock(editor, BlockType.Heading, { level: selectedLevel });
    ReactEditor.focus(editor);
  };

  const handleMenuOpen: MouseEventHandler<HTMLButtonElement> = (evt) => {
    if (isActive) {
      toggleBlock(editor, BlockType.Heading);
      return;
    }
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
                    onClick={() => handleMenuSelect(1)}
                    size="400"
                    radii="300"
                  >
                    <PhosphorIcon size="200" as={TextHOneIcon} />
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
                    onClick={() => handleMenuSelect(2)}
                    size="400"
                    radii="300"
                  >
                    <PhosphorIcon size="200" as={TextHTwoIcon} />
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
                    onClick={() => handleMenuSelect(3)}
                    size="400"
                    radii="300"
                  >
                    <PhosphorIcon size="200" as={TextHThreeIcon} />
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
        aria-pressed={isActive}
        size="400"
        radii="300"
      >
        <PhosphorIcon size="200" as={level ? headingIcons[level] : TextHOneIcon} />
        <PhosphorIcon size="200" as={isActive ? XIcon : CaretDownIcon} />
      </IconButton>
    </PopOut>
  );
}

type ExitFormattingProps = { tooltip: ReactNode };
export function ExitFormatting({ tooltip }: ExitFormattingProps) {
  const editor = useSlate();

  const handleClick = () => {
    if (isAnyMarkActive(editor)) {
      removeAllMark(editor);
    } else if (!isBlockActive(editor, BlockType.Paragraph)) {
      toggleBlock(editor, BlockType.Paragraph);
    }
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
          <Text size="B400">{`Exit ${KeySymbol.Hyper}`}</Text>
        </IconButton>
      )}
    </TooltipProvider>
  );
}

export function Toolbar() {
  const editor = useSlate();
  const modKey = isMacOS() ? KeySymbol.Command : 'Ctrl';
  const disableInline = isBlockActive(editor, BlockType.CodeBlock);

  const canEscape = isBlockActive(editor, BlockType.Paragraph)
    ? isAnyMarkActive(editor)
    : ReactEditor.isFocused(editor);
  const [isMarkdown, setIsMarkdown] = useSetting(settingsAtom, 'isMarkdown');

  return (
    <Box className={`${css.EditorToolbarBase} ${floatingToolbar}`}>
      <Scroll direction="Horizontal" size="0">
        <Box className={css.EditorToolbar} alignItems="Center" gap="300">
          <>
            <Box shrink="No" gap="100">
              <MarkButton
                format={MarkType.Bold}
                icon={TextBIcon}
                tooltip={<BtnTooltip text="Bold" shortCode={`${modKey} + B`} />}
              />
              <MarkButton
                format={MarkType.Italic}
                icon={TextItalicIcon}
                tooltip={<BtnTooltip text="Italic" shortCode={`${modKey} + I`} />}
              />
              <MarkButton
                format={MarkType.Underline}
                icon={TextUnderlineIcon}
                tooltip={<BtnTooltip text="Underline" shortCode={`${modKey} + U`} />}
              />
              <MarkButton
                format={MarkType.StrikeThrough}
                icon={TextStrikethroughIcon}
                tooltip={<BtnTooltip text="Strike Through" shortCode={`${modKey} + S`} />}
              />
              <MarkButton
                format={MarkType.Code}
                icon={CodeIcon}
                tooltip={<BtnTooltip text="Inline Code" shortCode={`${modKey} + [`} />}
              />
              <MarkButton
                format={MarkType.Spoiler}
                icon={EyeSlashIcon}
                tooltip={<BtnTooltip text="Spoiler" shortCode={`${modKey} + H`} />}
              />
            </Box>
            <Line variant="SurfaceVariant" direction="Vertical" style={{ height: toRem(12) }} />
          </>
          <Box shrink="No" gap="100">
            <BlockButton
              format={BlockType.BlockQuote}
              icon={QuotesIcon}
              tooltip={<BtnTooltip text="Block Quote" shortCode={`${modKey} + '`} />}
            />
            <BlockButton
              format={BlockType.CodeBlock}
              icon={CodeBlockIcon}
              tooltip={<BtnTooltip text="Block Code" shortCode={`${modKey} + ;`} />}
            />
            <BlockButton
              format={BlockType.OrderedList}
              icon={ListNumbersIcon}
              tooltip={<BtnTooltip text="Ordered List" shortCode={`${modKey} + 7`} />}
            />
            <BlockButton
              format={BlockType.UnorderedList}
              icon={ListBulletsIcon}
              tooltip={<BtnTooltip text="Unordered List" shortCode={`${modKey} + 8`} />}
            />
            <HeadingBlockButton />
          </Box>
          {canEscape && (
            <>
              <Line variant="SurfaceVariant" direction="Vertical" style={{ height: toRem(12) }} />
              <Box shrink="No" gap="100">
                <ExitFormatting
                  tooltip={
                    <BtnTooltip text="Exit Formatting" shortCode={`Escape, ${modKey} + E`} />
                  }
                />
              </Box>
            </>
          )}
          <Box className={css.MarkdownBtnBox} shrink="No" grow="Yes" justifyContent="End">
            <TooltipProvider
              align="End"
              tooltip={<BtnTooltip text={isMarkdown ? 'Disable Markdown' : 'Enable Markdown'} />}
              delay={500}
            >
              {(triggerRef) => (
                <IconButton
                  ref={triggerRef}
                  variant="SurfaceVariant"
                  onClick={() => setIsMarkdown(!isMarkdown)}
                  aria-pressed={isMarkdown}
                  size="300"
                  radii="300"
                  disabled={disableInline || !!isAnyMarkActive(editor)}
                >
                  <PhosphorIcon
                    size="200"
                    as={MarkdownLogoIcon}
                    weight={isMarkdown ? 'fill' : 'regular'}
                  />
                </IconButton>
              )}
            </TooltipProvider>
            <span />
          </Box>
        </Box>
      </Scroll>
    </Box>
  );
}
