import type {
  ChangeEventHandler,
  FormEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
} from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isTauri, invoke } from '@tauri-apps/api/core';
import dayjs from 'dayjs';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { RectCords } from 'folds';
import {
  Box,
  Button,
  color,
  config,
  Header,
  IconButton,
  Input,
  Menu,
  Scroll,
  Switch,
  Text,
  toRem,
} from 'folds';
import { PopOut } from '$components/overlay-stack';
import {
  ArrowUp,
  composerIcon,
  DotsSixVerticalIcon,
  Download,
  Gif,
  Info,
  menuIcon,
  Shield,
  Smiley,
  Sticker,
  X,
} from '$components/icons/phosphor';
import FocusTrap from 'focus-trap-react';
import {
  draggable,
  dropTargetForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { PageContent, SettingsSectionPage } from '$components/page';
import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import {
  CAPTION_POSITION_OPTIONS,
  MESSAGE_LAYOUT_OPTIONS,
  DATE_FORMATS,
  MESSAGE_SPACING_OPTIONS,
  SettingMenuSelector,
} from '$components/setting-menu-selector';
import { useSetting } from '$state/hooks/settings';
import type { EditorButtonId } from '$state/settings';
import { MessageLayout, RightSwipeAction, settingsAtom } from '$state/settings';
import { SettingTile, SettingToggle } from '$components/setting-tile';
import { getDebugLogger } from '$utils/debugLogger';
import { KeySymbol } from '$utils/key-symbol';
import { isDesktopTauri, isMacOS, isMobileOrTablet, isMobileTauri } from '$utils/platform';
import { stopPropagation } from '$utils/keyboard';
import { sessionsAtom, activeSessionIdAtom } from '$state/sessions';
import { isKeyHotkey } from 'is-hotkey';
import { settingsSyncLastSyncedAtom, settingsSyncStatusAtom } from '$hooks/useSettingsSync';
import { sanitizeDiagnosticsLogs } from '$utils/sentryScrubbers';
import { diagnosticCaptureActiveAtom } from '$state/debugLogger';
import { exportSettingsAsJson, importSettingsFromJson } from '$utils/settingsSync';
import { downloadJsonFile, saveFileToDevice } from '$utils/download';
import { useClientConfig } from '$hooks/useClientConfig';
import { getGifProvider, getGifProviderOptions } from '$utils/gifProviders';
import { CallSoundSettings } from './CallSoundSettings';

type DateHintProps = {
  hasChanges: boolean;
  handleReset: () => void;
};
function DateHint({ hasChanges, handleReset }: Readonly<DateHintProps>) {
  const [anchor, setAnchor] = useState<RectCords>();
  const categoryPadding = { padding: config.space.S200, paddingTop: 0 };

  const handleOpenMenu: MouseEventHandler<HTMLElement> = (evt) => {
    setAnchor(evt.currentTarget.getBoundingClientRect());
  };
  return (
    <PopOut
      anchor={anchor}
      position="Top"
      align="End"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => setAnchor(undefined),
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu style={{ maxHeight: '85dvh', overflowY: 'auto' }}>
            <Header size="300" style={{ padding: `0 ${config.space.S200}` }}>
              <Text size="L400">Formatting</Text>
            </Header>

            <Box direction="Column">
              <Box style={categoryPadding} direction="Column">
                <Header size="300">
                  <Text size="L400">Year</Text>
                </Header>
                <Box direction="Column" tabIndex={0} gap="100">
                  <Text size="T300">
                    YY
                    <Text as="span" size="Inherit" priority="300">
                      {': '}
                      Two-digit year
                    </Text>{' '}
                  </Text>
                  <Text size="T300">
                    YYYY
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Four-digit year
                    </Text>
                  </Text>
                </Box>
              </Box>

              <Box style={categoryPadding} direction="Column">
                <Header size="300">
                  <Text size="L400">Month</Text>
                </Header>
                <Box direction="Column" tabIndex={0} gap="100">
                  <Text size="T300">
                    M
                    <Text as="span" size="Inherit" priority="300">
                      {': '}The month
                    </Text>
                  </Text>
                  <Text size="T300">
                    MM
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Two-digit month
                    </Text>{' '}
                  </Text>
                  <Text size="T300">
                    MMM
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Short month name
                    </Text>
                  </Text>
                  <Text size="T300">
                    MMMM
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Full month name
                    </Text>
                  </Text>
                </Box>
              </Box>

              <Box style={categoryPadding} direction="Column">
                <Header size="300">
                  <Text size="L400">Day of the Month</Text>
                </Header>
                <Box direction="Column" tabIndex={0} gap="100">
                  <Text size="T300">
                    D
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Day of the month
                    </Text>
                  </Text>
                  <Text size="T300">
                    DD
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Two-digit day of the month
                    </Text>
                  </Text>
                </Box>
              </Box>
              <Box style={categoryPadding} direction="Column">
                <Header size="300">
                  <Text size="L400">Day of the Week</Text>
                </Header>
                <Box direction="Column" tabIndex={0} gap="100">
                  <Text size="T300">
                    d
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Day of the week (Sunday = 0)
                    </Text>
                  </Text>
                  <Text size="T300">
                    dd
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Two-letter day name
                    </Text>
                  </Text>
                  <Text size="T300">
                    ddd
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Short day name
                    </Text>
                  </Text>
                  <Text size="T300">
                    dddd
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Full day name
                    </Text>
                  </Text>
                </Box>
              </Box>
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      {hasChanges ? (
        <IconButton
          tabIndex={-1}
          onClick={handleReset}
          type="reset"
          variant="Secondary"
          size="300"
          radii="300"
        >
          {menuIcon(X)}
        </IconButton>
      ) : (
        <IconButton
          tabIndex={-1}
          onClick={handleOpenMenu}
          type="button"
          variant="Secondary"
          size="300"
          radii="300"
          aria-pressed={!!anchor}
        >
          {menuIcon(Info, { style: { opacity: config.opacity.P300 } })}
        </IconButton>
      )}
    </PopOut>
  );
}

type CustomDateFormatProps = {
  value: string;
  onChange: (format: string) => void;
};
function CustomDateFormat({ value, onChange }: Readonly<CustomDateFormatProps>) {
  const [dateFormatCustom, setDateFormatCustom] = useState(value);

  useEffect(() => {
    setDateFormatCustom(value);
  }, [value]);

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const format = evt.currentTarget.value;
    setDateFormatCustom(format);
  };

  const handleReset = () => {
    setDateFormatCustom(value);
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();

    const target = evt.target as HTMLFormElement | undefined;
    const customDateFormatInput = target?.customDateFormatInput as HTMLInputElement | undefined;
    const format = customDateFormatInput?.value;
    if (!format) return;

    onChange(format);
  };

  const hasChanges = dateFormatCustom !== value;
  return (
    <SettingTile focusId="custom-date-format">
      <Box as="form" onSubmit={handleSubmit} gap="200">
        <Box grow="Yes" direction="Column">
          <Input
            required
            name="customDateFormatInput"
            value={dateFormatCustom}
            onChange={handleChange}
            maxLength={16}
            autoComplete="off"
            variant="Secondary"
            radii="300"
            style={{ paddingRight: config.space.S200 }}
            after={<DateHint hasChanges={hasChanges} handleReset={handleReset} />}
          />
        </Box>
        <Button
          size="400"
          variant={hasChanges ? 'Success' : 'Secondary'}
          fill={hasChanges ? 'Solid' : 'Soft'}
          outlined
          radii="300"
          disabled={!hasChanges}
          type="submit"
        >
          <Text size="B400">Save</Text>
        </Button>
      </Box>
    </SettingTile>
  );
}

type PresetDateFormatProps = {
  value: string;
  onChange: (format: string) => void;
};

const getDisplayDate = (format: string): string =>
  format === '' ? 'Custom' : dayjs().format(format);

function PresetDateFormat({ value, onChange }: Readonly<PresetDateFormatProps>) {
  // A format typed into the custom field is not a preset, but it still has to
  // label the trigger rather than fall back to the first preset.
  const options = useMemo(() => {
    const formats: string[] = DATE_FORMATS.some((preset) => preset === value)
      ? DATE_FORMATS
      : [value, ...DATE_FORMATS];
    return formats.map((format) => ({ value: format, label: getDisplayDate(format) }));
  }, [value]);

  return <SettingMenuSelector value={value} options={options} onSelect={onChange} />;
}

function SelectDateFormat() {
  const [dateFormatString, setDateFormatString] = useSetting(settingsAtom, 'dateFormatString');
  const [selectedDateFormat, setSelectedDateFormat] = useState(dateFormatString);
  const customDateFormat = selectedDateFormat === '';

  const handlePresetChange = (format: string) => {
    setSelectedDateFormat(format);
    if (format !== '') {
      setDateFormatString(format);
    }
  };

  return (
    <>
      <SettingTile
        title="Date Format"
        focusId="date-format"
        description={customDateFormat ? dayjs().format(dateFormatString) : ''}
        after={<PresetDateFormat value={selectedDateFormat} onChange={handlePresetChange} />}
      />
      {customDateFormat && (
        <CustomDateFormat value={dateFormatString} onChange={setDateFormatString} />
      )}
    </>
  );
}

function getTombstoneSettingToggleTitle(showTombstone: boolean): string {
  if (showTombstone) {
    return 'Disable to hide redacted messages entirely instead of showing a tombstone.';
  }
  return 'Enable to show tombstone events for redacted messages instead of hiding them entirely.';
}

function DateAndTime() {
  const [hour24Clock, setHour24Clock] = useSetting(settingsAtom, 'hour24Clock');

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Date & Time</Text>
      <SettingToggle
        title="24-Hour Time Format"
        focusId="twenty-four-hour-time-format"
        value={hour24Clock}
        onChange={setHour24Clock}
      />

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SelectDateFormat />
      </SequenceCard>
    </Box>
  );
}

const EDITOR_BUTTON_META = {
  gif: { name: 'Gif', Icon: Gif },
  sticker: { name: 'Sticker', Icon: Sticker },
  emoji: { name: 'Emoji', Icon: Smiley },
};

type EditorButtonOrderRowProps = {
  id: EditorButtonId;
  index: number;
  isDragging: boolean;
  onDraggingIndexChange: (index: number | null) => void;
  onReorder: (from: number, to: number) => void;
};

function EditorButtonOrderRow({
  id,
  index,
  isDragging,
  onDraggingIndexChange,
  onReorder,
}: Readonly<EditorButtonOrderRowProps>) {
  const rowRef = useRef<HTMLDivElement>(null);
  const { name, Icon } = EDITOR_BUTTON_META[id];

  useEffect(() => {
    const element = rowRef.current;
    if (!element) return undefined;
    return draggable({
      element,
      getInitialData: () => ({ index }),
      onDragStart: () => onDraggingIndexChange(index),
      onDrop: () => onDraggingIndexChange(null),
    });
  }, [index, onDraggingIndexChange]);

  useEffect(() => {
    const element = rowRef.current;
    if (!element) return undefined;
    return dropTargetForElements({
      element,
      getData: () => ({ index }),
      onDrop: ({ source }) => {
        const from = source.data.index;
        if (typeof from !== 'number' || from === index) return;
        onReorder(from, index);
      },
    });
  }, [index, onReorder]);

  return (
    <SequenceCard
      ref={rowRef}
      className={SequenceCardStyle}
      variant="Surface"
      direction="Column"
      style={{ opacity: isDragging ? 0.4 : 1, cursor: 'grab' }}
    >
      <SettingTile
        focusId={`editor-button-order-${id}`}
        title={name}
        before={composerIcon(Icon, { weight: 'regular' })}
        after={composerIcon(DotsSixVerticalIcon)}
      />
    </SequenceCard>
  );
}

function Editor() {
  const [enterForNewline, setEnterForNewline] = useSetting(settingsAtom, 'enterForNewline');
  const [editorToolbar, setEditorToolbar] = useSetting(settingsAtom, 'editorToolbar');
  const [alwaysInlineEditor, setAlwaysInlineEditor] = useSetting(
    settingsAtom,
    'alwaysInlineEditor'
  );
  const [editorOldAddFile, setEditorOldAddFile] = useSetting(settingsAtom, 'editorOldAddFile');
  const [editorMicButton, setEditorMicButton] = useSetting(settingsAtom, 'editorMicButton');
  const [editorEmojiButton, setEditorEmojiButton] = useSetting(settingsAtom, 'editorEmojiButton');
  const [editorGifButton, setEditorGifButton] = useSetting(settingsAtom, 'editorGifButton');
  const gifs = useClientConfig().gifs;
  const [gifProviderSetting] = useSetting(settingsAtom, 'gifProvider');
  const gifProvider = getGifProvider(gifs, gifProviderSetting);
  const [editorStickerButton, setEditorStickerButton] = useSetting(
    settingsAtom,
    'editorStickerButton'
  );
  const [editorButtonOrder, setEditorButtonOrder] = useSetting(settingsAtom, 'editorButtonOrder');
  const [showMarkdownPreview, setShowMarkdownPreview] = useSetting(
    settingsAtom,
    'showMarkdownPreview'
  );
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const handleReorder = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      setEditorButtonOrder((prev) => {
        const next = [...prev];
        const removed = next.splice(from, 1);
        next.splice(to, 0, ...removed);
        return next;
      });
    },
    [setEditorButtonOrder]
  );
  const enabledButtons: Record<EditorButtonId, boolean> = {
    gif: editorGifButton,
    sticker: editorStickerButton,
    emoji: editorEmojiButton,
  };
  const hasEnabledOrder = editorButtonOrder.some((id) => enabledButtons[id]);
  const [hideActivity, setHideActivity] = useSetting(settingsAtom, 'hideActivity');
  const [hideReads, setHideReads] = useSetting(settingsAtom, 'hideReads');
  const [sendPresence, setSendPresence] = useSetting(settingsAtom, 'sendPresence');
  const [mentionInReplies, setMentionInReplies] = useSetting(settingsAtom, 'mentionInReplies');
  const [sendIndividualAttachmentAsCaption, setSendIndividualAttachmentAsCaption] = useSetting(
    settingsAtom,
    'sendIndividualAttachmentAsCaption'
  );

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Editor</Text>
      <SettingToggle
        title="ENTER for Newline"
        focusId="enter-for-newline"
        description={`Use ${isMacOS() ? KeySymbol.Command : 'Ctrl'} + ENTER to send message.`}
        value={enterForNewline}
        onChange={setEnterForNewline}
      />
      <SettingToggle
        title="Message Formatting Toolbar"
        focusId="composer-formatting-toolbar"
        description="Enable the formatting toolbar in the message composer."
        value={editorToolbar}
        onChange={setEditorToolbar}
      />
      <SettingToggle
        title="Show Markdown Preview"
        focusId="composer-markdown-preview"
        description="Show a rendered preview of your markdown above the message composer as you type."
        value={showMarkdownPreview}
        onChange={setShowMarkdownPreview}
      />
      <SettingToggle
        title="Hide Add Menu in the Editor"
        focusId="hide-add-menu"
        description="Make the Plus button in the editor only add files. You may still send the special items using commands such as /poll and /location"
        value={editorOldAddFile}
        onChange={setEditorOldAddFile}
      />
      <SettingToggle
        title="Show Voice Recording Button"
        focusId="show-voice-recording-button"
        description="Show the microphone button in the message composer. When off, the send button shows even when the editor is empty."
        value={editorMicButton}
        onChange={setEditorMicButton}
      />
      <SettingToggle
        title="Show Emoji Button"
        focusId="show-emoji-button"
        description="Show the emoji button inline with the message composer."
        value={editorEmojiButton}
        onChange={setEditorEmojiButton}
      />
      <SettingToggle
        title="Show Gif Button"
        focusId="show-gif-button"
        description={`Show the gif button inline with the message composer. This makes requests to ${gifProvider.searchHost} whenever you search for a gif.`}
        value={editorGifButton}
        onChange={setEditorGifButton}
      />
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Gif Provider"
          focusId="gif-provider"
          description="Which service the gif picker searches."
          after={<SelectGifProvider />}
        />
      </SequenceCard>
      <SettingToggle
        title="Show Sticker Button"
        focusId="show-sticker-button"
        description="Show the sticker button inline with the message composer."
        value={editorStickerButton}
        onChange={setEditorStickerButton}
      />
      <SettingToggle
        title="Always Inline Editor"
        focusId="always-inline-editor"
        description="Always keep the last line of the text editor inline with UI buttons."
        value={alwaysInlineEditor}
        onChange={setAlwaysInlineEditor}
      />
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Composer Button Order"
          focusId="composer-button-order"
          description="Drag to reorder the buttons shown in the message composer. Use the show/hide toggles above to control which buttons appear."
        />
        {hasEnabledOrder && (
          <Box
            direction="Column"
            gap="200"
            style={{
              backgroundColor: color.Background.Container,
              borderRadius: config.radii.R400,
              marginInline: config.space.S300,
              marginTop: config.space.S300,
            }}
          >
            {editorButtonOrder.map((id, index) =>
              enabledButtons[id] ? (
                <EditorButtonOrderRow
                  key={id}
                  id={id}
                  index={index}
                  isDragging={draggingIndex === index}
                  onDraggingIndexChange={setDraggingIndex}
                  onReorder={handleReorder}
                />
              ) : null
            )}
          </Box>
        )}
      </SequenceCard>
      <SettingToggle
        title="Hide Typing Indicators"
        focusId="hide-typing-indicators"
        description="Turn off typing status."
        value={hideActivity}
        onChange={setHideActivity}
      />
      <SettingToggle
        title="Hide Read Receipts"
        focusId="hide-read-receipts"
        description="Turn off read receipts."
        value={hideReads}
        onChange={setHideReads}
      />
      <SettingToggle
        title="Presence Status"
        focusId="presence-status"
        description="Show and receive online status from other users."
        value={sendPresence}
        onChange={setSendPresence}
      />
      <SettingToggle
        title="Send notifications for replies"
        focusId="reply-notifications"
        description="Disable to use silent replies by default. You can still toggle reply notifications for each reply."
        value={mentionInReplies}
        onChange={setMentionInReplies}
      />
      <SettingToggle
        title="Send text with individual attachment as caption"
        focusId="reply-notifications"
        description="Send the contents of the message field as the attachment caption if present."
        value={sendIndividualAttachmentAsCaption}
        onChange={setSendIndividualAttachmentAsCaption}
      />
    </Box>
  );
}

function SelectGifProvider() {
  const gifs = useClientConfig().gifs;
  const [gifProvider, setGifProvider] = useSetting(settingsAtom, 'gifProvider');

  return (
    <SettingMenuSelector
      value={gifProvider}
      options={getGifProviderOptions(gifs)}
      onSelect={setGifProvider}
    />
  );
}

function SelectMessageLayout() {
  const [messageLayout, setMessageLayout] = useSetting(settingsAtom, 'messageLayout');

  return (
    <SettingMenuSelector
      value={messageLayout}
      options={MESSAGE_LAYOUT_OPTIONS}
      onSelect={setMessageLayout}
    />
  );
}
function SelectCaptionPosition() {
  const [captionPosition, setCaptionPosition] = useSetting(settingsAtom, 'captionPosition');

  return (
    <SettingMenuSelector
      value={captionPosition}
      options={CAPTION_POSITION_OPTIONS}
      onSelect={setCaptionPosition}
    />
  );
}

function SelectMessageSpacing() {
  const [messageSpacing, setMessageSpacing] = useSetting(settingsAtom, 'messageSpacing');

  return (
    <SettingMenuSelector
      value={messageSpacing}
      options={MESSAGE_SPACING_OPTIONS}
      onSelect={setMessageSpacing}
    />
  );
}

function SelectRightSwipeAction({ disabled }: Readonly<{ disabled?: boolean }>) {
  const [action, setAction] = useSetting(settingsAtom, 'rightSwipeAction');

  return (
    <SettingMenuSelector
      value={action}
      options={[
        { value: RightSwipeAction.Reply, label: 'Reply to Message' },
        { value: RightSwipeAction.Members, label: 'Open Member List' },
      ]}
      onSelect={setAction}
      disabled={disabled}
      offset={5}
    />
  );
}

function Gestures({ isMobile }: Readonly<{ isMobile: boolean }>) {
  return (
    <Box direction="Column" gap="100" style={{ opacity: isMobile ? 1 : 0.5 }}>
      <Text size="L400">Gestures {!isMobile && '(Mobile Only)'}</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Right Swipe Action"
          focusId="right-swipe-action"
          description="What happens when you swipe right on a message."
          after={<SelectRightSwipeAction disabled={!isMobile} />}
        />
      </SequenceCard>
    </Box>
  );
}

function EmojiSelectorThresholdInput() {
  const [emojiThreshold, setEmojiThreshold] = useSetting(settingsAtom, 'emojiSuggestThreshold');
  const [inputValue, setInputValue] = useState(emojiThreshold.toString());

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const val = evt.target.value;
    setInputValue(val);

    const parsed = Number.parseInt(val, 10);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 10) {
      setEmojiThreshold(parsed);
    }
  };

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (evt) => {
    if (isKeyHotkey('escape', evt)) {
      evt.stopPropagation();
      setInputValue(emojiThreshold.toString());
      (evt.target as HTMLInputElement).blur();
    }

    if (isKeyHotkey('enter', evt)) {
      (evt.target as HTMLInputElement).blur();
    }
  };

  return (
    <Input
      style={{ width: toRem(80) }}
      variant={Number.parseInt(inputValue, 10) === emojiThreshold ? 'Secondary' : 'Success'}
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

function Calls() {
  const [alwaysShowCallButton, setAlwaysShowCallButton] = useSetting(
    settingsAtom,
    'alwaysShowCallButton'
  );
  const [joinCallOnSingleClick, setjoinCallOnSingleClick] = useSetting(
    settingsAtom,
    'joinCallOnSingleClick'
  );

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Calls</Text>
      <SettingToggle
        title="Show Call Button for Large Rooms"
        focusId="large-room-call-button"
        value={alwaysShowCallButton}
        onChange={setAlwaysShowCallButton}
      />
      <SettingToggle
        title="Join voice calls by just clicking the room's icon"
        focusId="join-on-click-voicecalls"
        value={joinCallOnSingleClick}
        onChange={setjoinCallOnSingleClick}
      />
      <CallSoundSettings />
    </Box>
  );
}

function Messages() {
  const [hideMembershipEvents, setHideMembershipEvents] = useSetting(
    settingsAtom,
    'hideMembershipEvents'
  );
  const [hideNickAvatarEvents, setHideNickAvatarEvents] = useSetting(
    settingsAtom,
    'hideNickAvatarEvents'
  );
  const [mediaAutoLoad, setMediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [showHiddenEvents, setShowHiddenEvents] = useSetting(settingsAtom, 'showHiddenEvents');
  const [showTombstoneEvents, setShowTombstoneEvents] = useSetting(
    settingsAtom,
    'showTombstoneEvents'
  );
  const [hiddenEventEdits, setHiddenEventEdits] = useSetting(settingsAtom, 'hiddenEventEdits');
  const [hiddenEventRedactionTimeline, setHiddenEventRedactionTimeline] = useSetting(
    settingsAtom,
    'hiddenEventRedactionTimeline'
  );
  const [hiddenEventReactions, setHiddenEventReactions] = useSetting(
    settingsAtom,
    'hiddenEventReactions'
  );
  const [hiddenEventReactionTombstone, setHiddenEventReactionTombstone] = useSetting(
    settingsAtom,
    'hiddenEventReactionTombstone'
  );
  const [hiddenEventReactionRedactionTimeline, setHiddenEventReactionRedactionTimeline] =
    useSetting(settingsAtom, 'hiddenEventReactionRedactionTimeline');
  const [hiddenEventOther, setHiddenEventOther] = useSetting(settingsAtom, 'hiddenEventOther');
  const [hideMembershipInReadOnly, setHideMembershipInReadOnly] = useSetting(
    settingsAtom,
    'hideMembershipInReadOnly'
  );
  const [showAllTimestamps, setShowAllTimestamps] = useSetting(settingsAtom, 'showAllTimestamps');

  const [messageLayout] = useSetting(settingsAtom, 'messageLayout');
  const [rightBubbles, setRightBubbles] = useSetting(settingsAtom, 'useRightBubbles');
  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Messages</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Message Layout"
          focusId="message-layout"
          after={<SelectMessageLayout />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Message Spacing"
          focusId="message-spacing"
          after={<SelectMessageSpacing />}
        />
      </SequenceCard>
      <SettingToggle
        title="Show All Timestamps"
        focusId="show-all-timestamps"
        description="Display a timestamp on every message, including consecutive messages from the same sender that are normally grouped."
        value={showAllTimestamps}
        onChange={setShowAllTimestamps}
      />
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="File description placement"
          focusId="file-description-placement"
          after={<SelectCaptionPosition />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Emoji Selector Character Threshold"
          focusId="emoji-selector-threshold"
          after={<EmojiSelectorThresholdInput />}
        />
      </SequenceCard>
      {messageLayout === MessageLayout.Bubble && (
        <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
          <SettingTile
            title="Right Aligned Bubbles"
            focusId="right-aligned-bubbles"
            description="While using bubble layout, have your bubbles right aligned."
            after={<Switch variant="Primary" value={rightBubbles} onChange={setRightBubbles} />}
          />
        </SequenceCard>
      )}
      <SettingToggle
        title="Disable Media Auto Load"
        focusId="disable-media-auto-load"
        value={!mediaAutoLoad}
        onChange={(v) => setMediaAutoLoad(!v)}
      />
      <SettingToggle
        title="Hide Membership Change"
        focusId="hide-membership-change"
        value={hideMembershipEvents}
        onChange={setHideMembershipEvents}
      />
      <SettingToggle
        title="Hide Profile Change"
        focusId="hide-profile-change"
        value={hideNickAvatarEvents}
        onChange={setHideNickAvatarEvents}
      />
      <SettingToggle
        title="Hide Member Events in Read-Only Rooms"
        focusId="hide-member-events-read-only-rooms"
        description="Hide membership changes, reactions, and reaction redactions in read-only rooms such as announcement channels."
        value={hideMembershipInReadOnly}
        onChange={setHideMembershipInReadOnly}
      />
      <SettingToggle
        title="Show Hidden Events"
        focusId="show-hidden-events"
        description="Reveal additional timeline events that are normally filtered out."
        value={showHiddenEvents}
        onChange={setShowHiddenEvents}
        switchTitle={
          showHiddenEvents
            ? 'Disable to hide hidden events'
            : 'Enable to show hidden events, this will cause visual clutter in busy rooms.'
        }
      />
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        style={{ opacity: showHiddenEvents ? 1 : 0.5 }}
      >
        <SettingTile
          title="Show Edit Events"
          focusId="hidden-event-edits"
          description="Show message edits as separate timeline events with a link to the previous version."
          after={
            <Switch
              variant="Primary"
              value={hiddenEventEdits}
              onChange={setHiddenEventEdits}
              disabled={!showHiddenEvents}
            />
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        style={{ opacity: showHiddenEvents ? 1 : 0.5 }}
      >
        <SettingTile
          title="Show Tombstones for Redacted Messages"
          focusId="show-redacted-message-tombstones"
          description="Show a tombstone in place of redacted messages instead of hiding them entirely."
          after={
            <Switch
              variant="Primary"
              value={showTombstoneEvents}
              onChange={setShowTombstoneEvents}
              title={getTombstoneSettingToggleTitle(showTombstoneEvents)}
              disabled={!showHiddenEvents}
            />
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        style={{ opacity: showHiddenEvents ? 1 : 0.5 }}
      >
        <SettingTile
          title="Show Redaction Events"
          focusId="hidden-event-redaction-timeline"
          description="Show when a message was redacted as a timeline event with a link to the original message."
          after={
            <Switch
              variant="Primary"
              value={hiddenEventRedactionTimeline}
              onChange={setHiddenEventRedactionTimeline}
              disabled={!showHiddenEvents}
            />
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        style={{ opacity: showHiddenEvents ? 1 : 0.5 }}
      >
        <SettingTile
          title="Show Reaction Events"
          focusId="hidden-event-reactions"
          description="Show reactions as separate timeline events with a link to the target message."
          after={
            <Switch
              variant="Primary"
              value={hiddenEventReactions}
              onChange={setHiddenEventReactions}
              disabled={!showHiddenEvents}
            />
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        style={{ opacity: showHiddenEvents ? 1 : 0.5 }}
      >
        <SettingTile
          title="Show Tombstones for Redacted Reactions"
          focusId="hidden-event-reaction-tombstones"
          description="Show a tombstone in place of redacted reactions instead of hiding them entirely."
          after={
            <Switch
              variant="Primary"
              value={hiddenEventReactionTombstone}
              onChange={setHiddenEventReactionTombstone}
              disabled={!showHiddenEvents}
            />
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        style={{ opacity: showHiddenEvents ? 1 : 0.5 }}
      >
        <SettingTile
          title="Show Reaction Redaction Events"
          focusId="hidden-event-reaction-redaction-timeline"
          description="Show when a reaction was removed as a timeline event with a link to the target message."
          after={
            <Switch
              variant="Primary"
              value={hiddenEventReactionRedactionTimeline}
              onChange={setHiddenEventReactionRedactionTimeline}
              disabled={!showHiddenEvents}
            />
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        style={{ opacity: showHiddenEvents ? 1 : 0.5 }}
      >
        <SettingTile
          title="Show Other Hidden Events"
          focusId="hidden-event-other"
          description="Show generic state events and other unrecognized timeline events."
          after={
            <Switch
              variant="Primary"
              value={hiddenEventOther}
              onChange={setHiddenEventOther}
              disabled={!showHiddenEvents}
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}

function Embeds() {
  const [multiplePreviews, setMultiplePreviews] = useSetting(settingsAtom, 'multiplePreviews');
  const [bundledPreview, setBundledPreview] = useSetting(settingsAtom, 'bundledPreview');
  const [urlPreview, setUrlPreview] = useSetting(settingsAtom, 'urlPreview');
  const [encUrlPreview, setEncUrlPreview] = useSetting(settingsAtom, 'encUrlPreview');
  const [clientUrlPreview, setClientUrlPreview] = useSetting(settingsAtom, 'clientUrlPreview');
  const [showInteractiveMap, setShowInteractiveMap] = useSetting(
    settingsAtom,
    'showInteractiveMap'
  );
  const [showEncInteractiveMap, setEncShowInteractiveMap] = useSetting(
    settingsAtom,
    'showEncInteractiveMap'
  );
  const [encClientUrlPreview, setEncClientUrlPreview] = useSetting(
    settingsAtom,
    'encClientUrlPreview'
  );
  const [clientPreviewYoutube, setClientPreviewYoutube] = useSetting(
    settingsAtom,
    'clientPreviewYoutube'
  );
  const [externalGifAutoLoadEncrypted, setExternalGifAutoLoadEncrypted] = useSetting(
    settingsAtom,
    'externalGifAutoLoadEncrypted'
  );
  const [enableGifPicker, setEnableGifPicker] = useSetting(settingsAtom, 'enableGifPicker');
  const [gifPickerProvider] = useSetting(settingsAtom, 'gifProvider');
  const gifPickerHost = getGifProvider(useClientConfig().gifs, gifPickerProvider).searchHost;
  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Embeds</Text>
      <SettingToggle
        title="Display Multiple Embeds"
        focusId="display-multiple-embeds"
        description="Display the embeds of all the links. Turning it off makes it only show the embed of the 1st item"
        value={multiplePreviews}
        onChange={setMultiplePreviews}
      />
      <SettingToggle
        title="Display Bundled Embeds"
        focusId="display-bundled-embeds"
        description="Show embeds when provided by the message itself. The embeds may be fabricated or incorrect."
        value={bundledPreview}
        onChange={setBundledPreview}
      />
      <SettingToggle
        title="Server-side Embeds"
        focusId="url-preview"
        description="Send the links from inside the messages to your homeserver to generate previews of the linked pages."
        value={urlPreview}
        onChange={setUrlPreview}
      />
      <SettingToggle
        title="Server-side Embeds in Encrypted Room"
        focusId="encrypted-room-url-preview"
        description="Request server-side embeds in E2EE chats. This partially decreases secrecy by revealing sent links to your homeserver"
        value={encUrlPreview}
        onChange={setEncUrlPreview}
      />
      <SettingToggle
        title="Client-side Embeds"
        focusId="client-side-embeds"
        description="Attempt to preview supported urls (e.g. YouTube) on the client, without involving the homeserver. This will expose your IP Address to third party services."
        value={clientUrlPreview}
        onChange={setClientUrlPreview}
        switchTitle={clientUrlPreview ? 'Disable client-side embeds' : 'Enable client-side embeds'}
      />
      {clientUrlPreview && (
        <>
          <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
            <SettingTile
              title="Client-side Embeds in Encrypted Rooms"
              focusId="encrypted-room-embeds"
              after={
                <Switch
                  variant="Primary"
                  value={encClientUrlPreview}
                  onChange={setEncClientUrlPreview}
                  title={
                    encClientUrlPreview
                      ? 'Disable client-side embeds in encrypted rooms'
                      : 'Enable client-side embeds in encrypted rooms'
                  }
                />
              }
            />
          </SequenceCard>
          <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
            <SettingTile
              title="Embed YouTube Links"
              focusId="embed-youtube-links"
              after={
                <Switch
                  variant="Primary"
                  value={clientPreviewYoutube}
                  onChange={setClientPreviewYoutube}
                  title={
                    clientPreviewYoutube
                      ? 'Disable client-side Youtube video embeds'
                      : 'Enable client-side Youtube video embeds'
                  }
                />
              }
            />
          </SequenceCard>
        </>
      )}
      <SettingToggle
        title="Enable Gif Picker"
        focusId="enable-gif-picker"
        description={`Enables the gif picker in the emoji board. This reduces Privacy because it makes requests to ${gifPickerHost} whenever you search for a gif.`}
        value={enableGifPicker}
        onChange={setEnableGifPicker}
        switchTitle={enableGifPicker ? 'Disable Gif Picker' : 'Enable Gif Picker'}
      />
      <SettingToggle
        title="Automatically Load External GIFs in Encrypted Rooms"
        focusId="external-gif-auto-load-encrypted"
        description="Loading contacts the GIF provider directly and may reveal when you viewed a GIF."
        value={externalGifAutoLoadEncrypted}
        onChange={setExternalGifAutoLoadEncrypted}
      />
      <SettingToggle
        title="Show Interactive maps"
        focusId="show-interactive-map"
        description="Show an interactive map in messages. This reduces Privacy because it requests map data from OpenStreetMap.org whenever you need to load a uncached part of the maps."
        value={showInteractiveMap}
        onChange={setShowInteractiveMap}
        switchTitle={showInteractiveMap ? 'Disable Interactive Map' : 'Enable Interactive Map'}
      />
      <SettingToggle
        title="Show Interactive maps in Encrypted Rooms"
        focusId="show-interactive-map-enc"
        description="Show an interactive map in Encrypted rooms. This reduces Privacy because it requests map data from OpenStreetMap.org whenever you need to load a uncached part of the maps."
        value={showEncInteractiveMap}
        onChange={setEncShowInteractiveMap}
        switchTitle={showEncInteractiveMap ? 'Disable Interactive Map' : 'Enable Interactive Map'}
      />
    </Box>
  );
}

type GeneralProps = {
  requestBack?: () => void;
  requestClose: () => void;
};

function Sync() {
  const sessions = useAtomValue(sessionsAtom);
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const setSessions = useSetAtom(sessionsAtom);
  const activeSession = sessions.find((s) => s.userId === activeSessionId) ?? sessions[0];

  const useSlidingSync = activeSession?.slidingSyncOptIn === true;

  const handleSetSlidingSync = (value: boolean) => {
    if (!activeSession) return;
    setSessions({
      type: 'UPDATE',
      userId: activeSession.userId,
      patch: { slidingSyncOptIn: value },
    });
    window.location.reload();
  };

  const [syncEnabled, setSyncEnabled] = useSetting(settingsAtom, 'settingsSyncEnabled');
  const lastSynced = useAtomValue(settingsSyncLastSyncedAtom);
  const syncStatus = useAtomValue(settingsSyncStatusAtom);
  const fullSettings = useAtomValue(settingsAtom);
  const setSettings = useSetAtom(settingsAtom);

  const [importError, setImportError] = useState<string | null>(null);

  const handleImport = async () => {
    setImportError(null);
    const merged = await importSettingsFromJson(fullSettings);
    if (merged === null) {
      setImportError('Could not import — file was invalid or you cancelled.');
      return;
    }
    setSettings(merged);
  };

  const syncStatusLabel: Record<typeof syncStatus, string> = {
    idle: lastSynced
      ? `Last synced at ${dayjs(lastSynced).format('HH:mm:ss')}`
      : 'Not yet synced this session',
    syncing: 'Syncing…',
    partial: 'Settings synced, but some local tweaks were too large to sync.',
    error: 'Sync failed — will retry on next change',
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Data Syncing</Text>
      <SettingToggle
        title="Use Sliding Sync"
        focusId="use-sliding-sync"
        description={
          <>Enable Sliding Sync for this current login/session. Requires server support.</>
        }
        value={useSlidingSync}
        onChange={handleSetSlidingSync}
      />
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Sync settings across devices"
          focusId="sync-across-devices"
          description="Store your settings in your Matrix account so they follow you to any Sable instance. Locally imported tweak CSS is uploaded as unencrypted account data readable by your homeserver. Notification and zoom preferences are kept per-device."
          after={<Switch variant="Primary" value={syncEnabled} onChange={setSyncEnabled} />}
        />
        {syncEnabled && (
          <SettingTile
            focusId="sync-status"
            title="Sync status"
            description={syncStatusLabel[syncStatus]}
          />
        )}
      </SequenceCard>
      <Box gap="200" wrap="Wrap" style={{ paddingTop: '4px' }}>
        <Button
          variant="Secondary"
          fill="Soft"
          size="300"
          radii="300"
          before={menuIcon(Download)}
          onClick={() => exportSettingsAsJson(fullSettings)}
        >
          <Text size="B300">Export Settings</Text>
        </Button>
        <Button
          variant="Secondary"
          fill="Soft"
          size="300"
          radii="300"
          before={menuIcon(ArrowUp)}
          onClick={handleImport}
        >
          <Text size="B300">Import Settings</Text>
        </Button>
      </Box>
      {importError && (
        <Text size="T200" style={{ color: 'var(--mx-color-critical-container-on)' }}>
          {importError}
        </Text>
      )}
    </Box>
  );
}

function DiagnosticsAndPrivacy() {
  const [sentryEnabled, setSentryEnabled] = useState(
    localStorage.getItem('sable_sentry_enabled') === 'true'
  );
  const [sessionReplayEnabled, setSessionReplayEnabled] = useState(
    localStorage.getItem('sable_sentry_replay_enabled') === 'true'
  );
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [diagnosticsState, setDiagnosticsState] = useState<
    'idle' | 'exporting' | 'success' | 'error'
  >('idle');
  const [captureActive, setCaptureActive] = useAtom(diagnosticCaptureActiveAtom);
  const [captureSince, setCaptureSince] = useState<number>();
  const [captureCompleted, setCaptureCompleted] = useState(false);
  const [exportDestination, setExportDestination] = useState<string>();

  const isSentryConfigured = Boolean(import.meta.env.VITE_SENTRY_DSN);

  const handleSentryToggle = (enabled: boolean) => {
    setSentryEnabled(enabled);
    if (enabled) {
      localStorage.setItem('sable_sentry_enabled', 'true');
    } else {
      localStorage.setItem('sable_sentry_enabled', 'false');
    }
    setNeedsRefresh(true);
  };

  const handleReplayToggle = (enabled: boolean) => {
    setSessionReplayEnabled(enabled);
    if (enabled) {
      localStorage.setItem('sable_sentry_replay_enabled', 'true');
    } else {
      localStorage.removeItem('sable_sentry_replay_enabled');
    }
    setNeedsRefresh(true);
  };

  const handleDiagnosticsCapture = async () => {
    if (!captureActive && !captureCompleted) {
      const since = getDebugLogger().startCapture();
      setCaptureSince(since);
      setCaptureActive(true);
      setDiagnosticsState('idle');
      setExportDestination(undefined);
      return;
    }

    setDiagnosticsState('exporting');
    try {
      const since = captureSince ?? getDebugLogger().getCaptureSince();
      if (captureActive) {
        getDebugLogger().stopCapture();
        setCaptureActive(false);
        setCaptureCompleted(true);
      }
      const frontendLogs = getDebugLogger().exportLogs({ since });
      if (isDesktopTauri()) {
        const outputPath = await invoke<string | null | undefined>('export_diagnostics', {
          frontendLogs,
        });
        if (outputPath == null) {
          setDiagnosticsState('idle');
          return;
        }
        setExportDestination(outputPath);
      } else if (isMobileTauri()) {
        const zipBytes = await invoke<number[] | Uint8Array>('export_diagnostics', {
          frontendLogs,
        });
        const filename = `sable-diagnostics-${dayjs().format('YYYY-MM-DD-HHmmss')}.zip`;
        const saveResult = await saveFileToDevice(
          new Blob([new Uint8Array(zipBytes)], { type: 'application/zip' }),
          filename,
          'application/zip'
        );
        if (saveResult === 'cancelled') {
          setDiagnosticsState('idle');
          return;
        }
        if (saveResult === 'failed') {
          setDiagnosticsState('error');
          return;
        }
      } else {
        const sanitizedLogs = sanitizeDiagnosticsLogs(frontendLogs);
        if (sanitizedLogs === null) {
          setDiagnosticsState('error');
          return;
        }
        await downloadJsonFile(sanitizedLogs, 'sable-web-diagnostics');
      }
      setDiagnosticsState('success');
      setCaptureCompleted(false);
      setCaptureSince(undefined);
    } catch {
      setDiagnosticsState('error');
    }
  };

  const handleDiscardCapture = () => {
    getDebugLogger().clear();
    setCaptureCompleted(false);
    setCaptureSince(undefined);
    setExportDestination(undefined);
    setDiagnosticsState('idle');
  };

  const handleStartNewCapture = () => {
    const since = getDebugLogger().startCapture();
    setCaptureSince(since);
    setCaptureActive(true);
    setCaptureCompleted(false);
    setDiagnosticsState('idle');
    setExportDestination(undefined);
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Diagnostics & Privacy</Text>
      {needsRefresh && (
        <Box
          style={{
            padding: '12px',
            backgroundColor: 'rgba(33, 150, 243, 0.1)',
            borderRadius: '8px',
          }}
        >
          <Text size="T300" style={{ color: 'rgb(33, 150, 243)' }}>
            Please refresh the page for these settings to take effect.
          </Text>
        </Box>
      )}
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Error Reporting"
          focusId="error-reporting"
          description={
            isSentryConfigured
              ? 'Send anonymous crash reports to help improve Sable. No messages, room names, or personal data are included.'
              : 'Error reporting is not configured for this build.'
          }
          after={
            <Switch
              variant="Primary"
              value={sentryEnabled}
              onChange={handleSentryToggle}
              disabled={!isSentryConfigured}
            />
          }
        />
        {sentryEnabled && isSentryConfigured && (
          <SettingTile
            title="Session Replay"
            focusId="session-replay"
            description="Allow recording of UI interactions to help debug errors. All text, media, and inputs are fully masked before sending."
            after={
              <Switch
                variant="Primary"
                value={sessionReplayEnabled}
                onChange={handleReplayToggle}
              />
            }
          />
        )}
      </SequenceCard>
      {(!isTauri() || isDesktopTauri() || isMobileTauri()) && (
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="300"
        >
          <SettingTile
            title="Capture Diagnostics"
            focusId="capture-diagnostics"
            description={
              captureActive
                ? 'Capture is active. Reproduce the problem, then stop and export the report.'
                : captureCompleted
                  ? 'Your completed capture is ready to export. You can retry the export or discard it.'
                  : 'Start a short, privacy-reviewed capture of errors and useful app activity. Nothing is uploaded automatically.'
            }
            after={
              <Button
                variant={captureActive ? 'Critical' : 'Secondary'}
                fill="Soft"
                size="300"
                radii="300"
                before={captureActive ? undefined : menuIcon(Download)}
                onClick={handleDiagnosticsCapture}
                disabled={diagnosticsState === 'exporting'}
              >
                <Text size="B300">
                  {diagnosticsState === 'exporting'
                    ? 'Exporting…'
                    : captureActive
                      ? 'Stop & Export'
                      : captureCompleted
                        ? 'Export Capture'
                        : 'Start Capture'}
                </Text>
              </Button>
            }
          />
          {diagnosticsState === 'success' && (
            <Text size="T200" style={{ color: 'var(--mx-color-positive-container-on)' }}>
              {isDesktopTauri()
                ? `Diagnostics ZIP saved to ${exportDestination ?? 'the selected destination'}. It includes frontend and native logs. Review it before sharing.`
                : isMobileTauri()
                  ? 'Diagnostics ZIP saved with content redacted where possible. Review it before sharing.'
                  : 'Frontend diagnostics downloaded with content redacted where possible. Review it before sharing.'}
            </Text>
          )}
          {diagnosticsState === 'error' && (
            <Text size="T200" style={{ color: 'var(--mx-color-critical-container-on)' }}>
              Could not export diagnostics. Please try again.
            </Text>
          )}
          {captureCompleted && diagnosticsState !== 'exporting' && (
            <Box gap="200" wrap="Wrap">
              <Button
                variant="Secondary"
                fill="Soft"
                size="300"
                radii="300"
                onClick={handleStartNewCapture}
              >
                <Text size="B300">Start New Capture</Text>
              </Button>
              <Button
                variant="Secondary"
                fill="Soft"
                size="300"
                radii="300"
                onClick={handleDiscardCapture}
              >
                <Text size="B300">Discard Capture</Text>
              </Button>
            </Box>
          )}
        </SequenceCard>
      )}
      <Box gap="200" wrap="Wrap" style={{ paddingTop: '4px' }}>
        <Button
          as="a"
          href="https://github.com/SableClient/Sable/blob/dev/docs/PRIVACY.md"
          rel="noreferrer noopener"
          target="_blank"
          variant="Secondary"
          fill="Soft"
          size="300"
          radii="300"
          before={menuIcon(Shield, { weight: 'fill' })}
        >
          <Text size="B300">Privacy Policy</Text>
        </Button>
      </Box>
    </Box>
  );
}

export function General({ requestBack, requestClose }: Readonly<GeneralProps>) {
  return (
    <SettingsSectionPage title="General" requestBack={requestBack} requestClose={requestClose}>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <DateAndTime />
              <Gestures isMobile={isMobileOrTablet()} />
              <Editor />
              <Messages />
              <Embeds />
              <Calls />
              <Sync />
              <DiagnosticsAndPrivacy />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
