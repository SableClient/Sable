import type { KeyboardEventHandler } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Room } from '$types/matrix-sdk';
import type { RectCords } from 'folds';
import { Box, Chip, IconButton, Spinner, Text, config } from 'folds';
import { PopOut } from '$components/overlay-stack';
import { composerIcon, Smiley } from '$components/icons/phosphor';
import { isKeyHotkey } from 'is-hotkey';
import {
  AutocompletePrefix,
  useAutocompleteQuery,
  EmoticonAutocomplete,
  MarkdownFormattingToolbarBottom,
  MarkdownFormattingToolbarToggle,
  createEmoticonElement,
  markEventConsumedByHost,
  plainToEditorInput,
  ProseMirrorEditorSurface,
  toMatrixCustomHTML,
  toPlainText,
  trimCustomHtml,
  toggleProseMirrorKeyboardShortcut,
  useEditor,
} from '$components/editor';
import { htmlToMarkdown } from '$plugins/markdown';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { UseStateProvider } from '$components/UseStateProvider';
import { EmojiBoard } from '$components/emoji-board';
import { SettingTile } from '$components/setting-tile';
import * as css from './BioEditor.css';

type BioEditorProps = {
  value?: string;
  isSaving?: boolean;
  imagePackRooms?: Room[];
  onSave: (htmlContent: string, plainText: string) => void;
};

export function BioEditor({ value, isSaving, imagePackRooms, onSave }: BioEditorProps) {
  const editor = useEditor();
  const [enterForNewline] = useSetting(settingsAtom, 'enterForNewline');
  const [shortcutOverrides] = useSetting(settingsAtom, 'shortcutOverrides');

  const [autocompleteQuery, setAutocompleteQuery, handleCloseAutocomplete] =
    useAutocompleteQuery(editor);
  const [hasChanged, setHasChanged] = useState(false);

  const prevValue = useRef(value);
  const initialized = useRef(false);

  const handleSave = useCallback(() => {
    const plainText = toPlainText(editor.getDocument()).trim();

    const customHtml = trimCustomHtml(toMatrixCustomHTML(editor.getDocument(), {}));

    onSave(customHtml || plainText, plainText);
    setHasChanged(false);
  }, [editor, onSave]);

  useEffect(() => {
    const valueChanged = prevValue.current !== value;
    const isFirstValidLoad = !initialized.current && value !== undefined;

    if (valueChanged || isFirstValidLoad) {
      prevValue.current = value;

      let normalizedValue: string | undefined = value;
      if (
        typeof normalizedValue === 'object' &&
        normalizedValue !== null &&
        'formatted_body' in normalizedValue
      ) {
        normalizedValue = (normalizedValue as { formatted_body?: string }).formatted_body;
      }

      const safeValue = typeof normalizedValue === 'string' ? normalizedValue : '';

      const incomingPlainText = toPlainText(
        plainToEditorInput(safeValue.includes('<') ? htmlToMarkdown(safeValue) : safeValue)
      ).trim();
      const currentPlainText = toPlainText(editor.getDocument()).trim();

      if (currentPlainText === incomingPlainText && initialized.current) return;

      const isLikelyHtml = safeValue.includes('<') || safeValue.includes('>');
      const initialValue = isLikelyHtml
        ? plainToEditorInput(htmlToMarkdown(safeValue))
        : plainToEditorInput(safeValue);

      editor.setDocument(initialValue);

      initialized.current = true;
      setHasChanged(false);
    }
  }, [value, editor]);

  const handleKeyDown: KeyboardEventHandler = useCallback(
    (evt) => {
      if (toggleProseMirrorKeyboardShortcut(editor, evt, shortcutOverrides)) {
        evt.preventDefault();
        return;
      }
      if (isKeyHotkey('mod+enter', evt) || (!enterForNewline && isKeyHotkey('enter', evt))) {
        evt.preventDefault();
        markEventConsumedByHost(evt.nativeEvent);
        handleSave();
      }
    },
    [editor, enterForNewline, handleSave, shortcutOverrides]
  );

  const handleKeyUp: KeyboardEventHandler = useCallback(
    (evt) => {
      if (isKeyHotkey('escape', evt)) {
        evt.preventDefault();
        return;
      }
      setAutocompleteQuery(editor.getAutocompleteQuery([AutocompletePrefix.Emoticon]));
    },
    [editor, setAutocompleteQuery]
  );

  const handleEmoticonSelect = (key: string, shortcode: string) => {
    editor.insertInline(createEmoticonElement(key, shortcode));
    editor.insertText(' ');
    setHasChanged(true);
  };

  return (
    <Box direction="Column" gap="100">
      <SettingTile title="About You" focusId="about-you" description="Customize your bio." />
      <Box className={css.BioEditorContainer} direction="Column" style={{ position: 'relative' }}>
        {autocompleteQuery?.prefix === AutocompletePrefix.Emoticon && (
          <EmoticonAutocomplete
            imagePackRooms={imagePackRooms || []}
            controller={editor}
            query={autocompleteQuery!}
            requestClose={handleCloseAutocomplete}
          />
        )}
        <ProseMirrorEditorSurface
          controller={editor}
          placeholder="Write a bio..."
          onDocumentChange={() => {
            if (!hasChanged) setHasChanged(true);
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          maxHeight="200px"
          variant="Background"
          bottom={
            <Box direction="Column" style={{ backgroundColor: 'var(--sable-bg-container)' }}>
              <MarkdownFormattingToolbarBottom controller={editor} />
              <Box
                style={{ padding: config.space.S200, paddingTop: 0 }}
                alignItems="End"
                justifyContent="SpaceBetween"
                gap="100"
              >
                <Box gap="200" alignItems="Center">
                  {hasChanged && (
                    <Chip
                      onClick={handleSave}
                      variant="Primary"
                      radii="Pill"
                      disabled={isSaving}
                      outlined
                      before={
                        isSaving ? <Spinner variant="Primary" fill="Soft" size="100" /> : undefined
                      }
                    >
                      <Text size="B300">{isSaving ? 'Saving' : 'Save'}</Text>
                    </Chip>
                  )}
                </Box>
                <Box gap="Inherit">
                  <MarkdownFormattingToolbarToggle variant="Background" />
                  <UseStateProvider initial={undefined}>
                    {(anchor: RectCords | undefined, setAnchor) => (
                      <PopOut
                        anchor={anchor}
                        alignOffset={-8}
                        position="Top"
                        align="End"
                        content={
                          <EmojiBoard
                            imagePackRooms={imagePackRooms ?? []}
                            returnFocusOnDeactivate={false}
                            onEmojiSelect={handleEmoticonSelect}
                            onCustomEmojiSelect={handleEmoticonSelect}
                            requestClose={() =>
                              setAnchor((v) => {
                                if (v) {
                                  editor.focus();
                                  return undefined;
                                }
                                return v;
                              })
                            }
                          />
                        }
                      >
                        <IconButton
                          aria-pressed={anchor !== undefined}
                          variant="Background"
                          size="300"
                          radii="300"
                          onClick={(evt) => setAnchor(evt.currentTarget.getBoundingClientRect())}
                        >
                          {composerIcon(Smiley, {
                            weight: anchor !== undefined ? 'fill' : 'regular',
                          })}
                        </IconButton>
                      </PopOut>
                    )}
                  </UseStateProvider>
                </Box>
              </Box>
            </Box>
          }
        />
      </Box>
    </Box>
  );
}
