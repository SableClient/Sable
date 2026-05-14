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
import { SettingTile } from '$components/setting-tile';
import * as css from './BioEditor.css';

type BioEditorProps = {
  value?: string;
  isSaving?: boolean;
  imagePackRooms?: Room[];
  onSave: (htmlContent: string, plainText: string) => void;
};

const BIO_LIMIT = 1024;

export function BioEditor({ value, isSaving, imagePackRooms, onSave }: BioEditorProps) {
  const editor = useEditor();
  const [enterForNewline] = useSetting(settingsAtom, 'enterForNewline');

  const [autocompleteQuery, setAutocompleteQuery] =
    useState<AutocompleteQuery<AutocompletePrefix>>();
  const [hasChanged, setHasChanged] = useState(false);
  const [charCount, setCharCount] = useState(0);

  const prevValue = useRef(value);
  const initialized = useRef(false);

  const updateStats = useCallback(() => {
    const plainText = toPlainText(editor.children).trim();
    setCharCount(plainText.length);
  }, [editor]);

  const handleSave = useCallback(() => {
    const plainText = toPlainText(editor.children).trim();
    if (plainText.length > BIO_LIMIT) return;

    const customHtml = trimCustomHtml(toMatrixCustomHTML(editor.children, {}));

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
      setHasChanged(false);
      updateStats();
    }
  }, [value, editor, updateStats]);

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
        return;
      }
      const prevWordRange = getPrevWorldRange(editor);
      const query = prevWordRange
        ? getAutocompleteQuery(editor, prevWordRange, [AutocompletePrefix.Emoticon])
        : undefined;
      setAutocompleteQuery(query);
    },
    [editor]
  );

  const handleCloseAutocomplete = useCallback(() => {
    ReactEditor.focus(editor);
    setAutocompleteQuery(undefined);
  }, [editor]);

  const handleEmoticonSelect = (key: string, shortcode: string) => {
    editor.insertNode(createEmoticonElement(key, shortcode));
    moveCursor(editor);
    setHasChanged(true);
    updateStats();
  };

  const isOverLimit = charCount > BIO_LIMIT;

  return (
    <Box direction="Column" gap="100">
      <SettingTile title="About You" focusId="about-you" description="Customize your bio." />
      <Box className={css.BioEditorContainer} direction="Column" style={{ position: 'relative' }}>
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
          placeholder="Write a bio..."
          onChange={() => {
            if (!hasChanged) setHasChanged(true);
            updateStats();
          }}
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
                <Box gap="200" alignItems="Center">
                  {hasChanged && (
                    <Chip
                      onClick={handleSave}
                      variant={isOverLimit ? 'Background' : 'Primary'}
                      radii="Pill"
                      disabled={isSaving || isOverLimit}
                      outlined
                      before={
                        isSaving ? <Spinner variant="Primary" fill="Soft" size="100" /> : undefined
                      }
                    >
                      <Text size="B300">{isSaving ? 'Saving' : 'Save'}</Text>
                    </Chip>
                  )}
                  <Text
                    size="T200"
                    priority={isOverLimit ? '500' : '300'}
                    style={{ opacity: isOverLimit ? 1 : 0.6 }}
                  >
                    {charCount} / {BIO_LIMIT}
                  </Text>
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
