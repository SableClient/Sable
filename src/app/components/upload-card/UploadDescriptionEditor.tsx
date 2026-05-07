import type { KeyboardEventHandler } from 'react';
import { useCallback, useEffect, useState, useRef } from 'react';
import type { Room } from '$types/matrix-sdk';
import type { RectCords } from 'folds';
import { Box, Chip, Icon, IconButton, Icons, PopOut, Spinner, Text, config } from 'folds';
import { Editor, Transforms } from 'slate';
import { ReactEditor } from 'slate-react';
import { isKeyHotkey } from 'is-hotkey';
import type { AutocompleteQuery } from '$components/editor';
import {
  AutocompletePrefix,
  CustomEditor,
  EmoticonAutocomplete,
  MarkdownFormattingToolbarBottom,
  MarkdownFormattingToolbarToggle,
  createEmoticonElement,
  getAutocompleteQuery,
  getPrevWorldRange,
  plainToEditorInput,
  moveCursor,
  toMatrixCustomHTML,
  toPlainText,
  trimCustomHtml,
  useEditor,
} from '$components/editor';
import { htmlToMarkdown } from '$plugins/markdown';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { UseStateProvider } from '$components/UseStateProvider';
import { EmojiBoard } from '$components/emoji-board';
import { mobileOrTablet } from '$utils/user-agent';
import * as css from './UploadDescriptionEditor.css';

type DescriptionEditorProps = {
  value?: string;
  isSaving?: boolean;
  imagePackRooms?: Room[];
  onSave: (plaintext: string, htmlContent: string) => void;
  onCancel: () => void;
};

export function DescriptionEditor({
  value,
  isSaving,
  imagePackRooms,
  onSave,
  onCancel,
}: Readonly<DescriptionEditorProps>) {
  const editor = useEditor();
  const [enterForNewline] = useSetting(settingsAtom, 'enterForNewline');

  const [autocompleteQuery, setAutocompleteQuery] =
    useState<AutocompleteQuery<AutocompletePrefix>>();

  const prevValue = useRef(value);
  const initialized = useRef(false);
  const handleSave = useCallback(() => {
    const plainText = toPlainText(editor.children).trim();

    const customHtml = trimCustomHtml(toMatrixCustomHTML(editor.children, {}));

    onSave(plainText, customHtml || plainText);
  }, [editor, onSave]);

  useEffect(() => {
    const valueChanged = prevValue.current !== value;
    const isFirstValidLoad = !initialized.current && value !== undefined;

    if (valueChanged || isFirstValidLoad) {
      prevValue.current = value;

      let normalizedValue = value;
      if (
        typeof normalizedValue === 'object' &&
        normalizedValue !== null &&
        'formatted_body' in normalizedValue
      ) {
        normalizedValue = (normalizedValue as { formatted_body: string }).formatted_body;
      }

      const safeValue = typeof normalizedValue === 'string' ? normalizedValue : '';

      const incomingPlainText = toPlainText(
        plainToEditorInput(safeValue.includes('<') ? htmlToMarkdown(safeValue) : safeValue)
      ).trim();
      const currentPlainText = toPlainText(editor.children).trim();

      if (currentPlainText === incomingPlainText && initialized.current) return;

      const isLikelyHtml = safeValue.includes('<') || safeValue.includes('>');
      const initialValue = isLikelyHtml
        ? plainToEditorInput(htmlToMarkdown(safeValue))
        : plainToEditorInput(safeValue);

      editor.children = initialValue;
      Editor.normalize(editor, { force: true });
      Transforms.select(editor, Editor.start(editor, []));

      initialized.current = true;
    }
  }, [value, editor]);

  const handleKeyDown: KeyboardEventHandler = useCallback(
    (evt) => {
      if (isKeyHotkey('mod+enter', evt) || (!enterForNewline && isKeyHotkey('enter', evt))) {
        evt.preventDefault();
        handleSave();
      }
    },
    [handleSave, enterForNewline]
  );

  const handleKeyUp: KeyboardEventHandler = useCallback(
    (evt) => {
      if (isKeyHotkey('escape', evt)) {
        evt.preventDefault();
        onCancel();
        return;
      }
      const prevWordRange = getPrevWorldRange(editor);
      const query = prevWordRange
        ? getAutocompleteQuery(editor, prevWordRange, [AutocompletePrefix.Emoticon])
        : undefined;
      setAutocompleteQuery(query);
    },
    [editor, onCancel]
  );

  const handleCloseAutocomplete = useCallback(() => {
    ReactEditor.focus(editor);
    setAutocompleteQuery(undefined);
  }, [editor]);

  const handleEmoticonSelect = (key: string, shortcode: string) => {
    editor.insertNode(createEmoticonElement(key, shortcode));
    moveCursor(editor);
  };

  return (
    <Box direction="Column" gap="100">
      <Box
        className={css.DescriptionEditorContainer}
        direction="Column"
        style={{ position: 'relative' }}
      >
        {autocompleteQuery?.prefix === AutocompletePrefix.Emoticon && (
          <EmoticonAutocomplete
            imagePackRooms={imagePackRooms || []}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        <CustomEditor
          editor={editor}
          placeholder="File Description..."
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          maxHeight="200px"
          variant="Background"
          bottom={
            <Box direction="Column" style={{ backgroundColor: 'var(--sable-bg-container)' }}>
              <MarkdownFormattingToolbarBottom />
              <Box
                style={{ padding: config.space.S200, paddingTop: 0 }}
                alignItems="End"
                justifyContent="SpaceBetween"
                gap="100"
              >
                <Box gap="200">
                  <Box gap="200" alignItems="Center">
                    <Chip
                      onClick={handleSave}
                      variant="Primary"
                      radii="Pill"
                      outlined
                      before={
                        isSaving ? <Spinner variant="Primary" fill="Soft" size="100" /> : undefined
                      }
                    >
                      <Text size="B300">{isSaving ? 'Saving' : 'Save'}</Text>
                    </Chip>
                  </Box>
                  <Box gap="200" alignItems="Center">
                    <Chip
                      onClick={onCancel}
                      variant="Warning"
                      radii="Pill"
                      outlined
                      before={
                        isSaving ? <Spinner variant="Primary" fill="Soft" size="100" /> : undefined
                      }
                    >
                      <Text size="B300">Cancel</Text>
                    </Chip>
                  </Box>
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
                                  if (!mobileOrTablet()) ReactEditor.focus(editor);
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
                          <Icon size="400" src={Icons.Smile} filled={anchor !== undefined} />
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
