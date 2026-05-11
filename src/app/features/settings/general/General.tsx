import type {
  ChangeEventHandler,
  FormEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
} from 'react';
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { useAtomValue, useSetAtom } from 'jotai';
import type { RectCords } from 'folds';
import {
  Box,
  Button,
  config,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Menu,
  MenuItem,
  PopOut,
  Scroll,
  Switch,
  Text,
  toRem,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { PageContent } from '$components/page';
import { SequenceCard } from '$components/sequence-card';
import { useSetting } from '$state/hooks/settings';
import type { DateFormat, MessageSpacing, CaptionPosition } from '$state/settings';
import { MessageLayout, RightSwipeAction, settingsAtom } from '$state/settings';
import { SettingTile } from '$components/setting-tile';
import { KeySymbol } from '$utils/key-symbol';
import { isMacOS, mobileOrTablet } from '$utils/user-agent';
import { stopPropagation } from '$utils/keyboard';
import { useMessageLayoutItems } from '$hooks/useMessageLayout';
import { useCaptionPositionItems } from '$hooks/useCaptionPosition';
import { useMessageSpacingItems } from '$hooks/useMessageSpacing';
import { useDateFormatItems } from '$hooks/useDateFormat';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { sessionsAtom, activeSessionIdAtom } from '$state/sessions';
import { useClientConfig } from '$hooks/useClientConfig';
import { resolveSlidingEnabled } from '$client/initMatrix';
import { isKeyHotkey } from 'is-hotkey';
import { settingsSyncLastSyncedAtom, settingsSyncStatusAtom } from '$hooks/useSettingsSync';
import { exportSettingsAsJson, importSettingsFromJson } from '$utils/settingsSync';
import { SettingsSectionPage } from '../SettingsSectionPage';

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
          <Menu style={{ maxHeight: '85vh', overflowY: 'auto' }}>
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
          <Icon src={Icons.Cross} size="100" />
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
          <Icon style={{ opacity: config.opacity.P300 }} size="100" src={Icons.Info} />
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
function PresetDateFormat({ value, onChange }: Readonly<PresetDateFormatProps>) {
  const [menuCords, setMenuCords] = useState<RectCords>();
  const dateFormatItems = useDateFormatItems();

  const getDisplayDate = (format: string): string =>
    format === '' ? 'Custom' : dayjs().format(format);

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSelect = (format: DateFormat) => {
    onChange(format);
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
          {getDisplayDate(dateFormatItems.find((i) => i.format === value)?.format ?? value)}
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
                {dateFormatItems.map((item) => (
                  <MenuItem
                    key={item.format}
                    size="300"
                    variant={value === item.format ? 'Primary' : 'Surface'}
                    radii="300"
                    onClick={() => handleSelect(item.format)}
                  >
                    <Text size="T300">{getDisplayDate(item.format)}</Text>
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

function getTombstoneSettingToggleTitle(showHidden: boolean, showTombstone: boolean): string {
  if (showHidden) {
    return 'Tombstone events are always shown when "Show Hidden Events" is enabled.';
  }
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
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="24-Hour Time Format"
          focusId="twenty-four-hour-time-format"
          after={<Switch variant="Primary" value={hour24Clock} onChange={setHour24Clock} />}
        />
      </SequenceCard>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SelectDateFormat />
      </SequenceCard>
    </Box>
  );
}

function Editor({ isMobile }: Readonly<{ isMobile: boolean }>) {
  const [enterForNewline, setEnterForNewline] = useSetting(settingsAtom, 'enterForNewline');
  const [editorToolbar, setEditorToolbar] = useSetting(settingsAtom, 'editorToolbar');
  const [hideActivity, setHideActivity] = useSetting(settingsAtom, 'hideActivity');
  const [hideReads, setHideReads] = useSetting(settingsAtom, 'hideReads');
  const [sendPresence, setSendPresence] = useSetting(settingsAtom, 'sendPresence');
  const [mentionInReplies, setMentionInReplies] = useSetting(settingsAtom, 'mentionInReplies');

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Editor</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        style={{ opacity: isMobile ? 0.5 : 1 }}
      >
        <SettingTile
          title="ENTER for Newline"
          focusId="enter-for-newline"
          description={`Use ${isMacOS() ? KeySymbol.Command : 'Ctrl'} + ENTER to send message. ${isMobile ? '(Disabled on Mobile)' : ''}`}
          after={
            <Switch
              variant="Primary"
              value={enterForNewline}
              onChange={setEnterForNewline}
              disabled={isMobile}
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Message Formatting Toolbar"
          focusId="composer-formatting-toolbar"
          description="Enable the formatting toolbar in the message composer."
          after={<Switch variant="Primary" value={editorToolbar} onChange={setEditorToolbar} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Hide Typing Indicators"
          focusId="hide-typing-indicators"
          description="Turn off typing status."
          after={<Switch variant="Primary" value={hideActivity} onChange={setHideActivity} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Hide Read Receipts"
          focusId="hide-read-receipts"
          description="Turn off read receipts."
          after={<Switch variant="Primary" value={hideReads} onChange={setHideReads} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Presence Status"
          focusId="presence-status"
          description="Show and receive online status from other users."
          after={<Switch variant="Primary" value={sendPresence} onChange={setSendPresence} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Send notifications for replies"
          focusId="reply-notifications"
          description="Disable to use silent replies by default. You can still toggle reply notifications for each reply."
          after={
            <Switch variant="Primary" value={mentionInReplies} onChange={setMentionInReplies} />
          }
        />
      </SequenceCard>
    </Box>
  );
}

function SelectMessageLayout() {
  const [menuCords, setMenuCords] = useState<RectCords>();
  const [messageLayout, setMessageLayout] = useSetting(settingsAtom, 'messageLayout');
  const messageLayoutItems = useMessageLayoutItems();

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSelect = (layout: MessageLayout) => {
    setMessageLayout(layout);
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
          {messageLayoutItems.find((i) => i.layout === messageLayout)?.name ?? messageLayout}
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
                {messageLayoutItems.map((item) => (
                  <MenuItem
                    key={item.layout}
                    size="300"
                    variant={messageLayout === item.layout ? 'Primary' : 'Surface'}
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
function SelectCaptionPosition() {
  const [menuCords, setMenuCords] = useState<RectCords>();
  const [captionPosition, setCaptionPosition] = useSetting(settingsAtom, 'captionPosition');
  const captionPositionItems = useCaptionPositionItems();

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSelect = (position: CaptionPosition) => {
    setCaptionPosition(position);
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
          {captionPositionItems.find((i) => i.layout === captionPosition)?.name ?? captionPosition}
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
                {captionPositionItems.map((item) => (
                  <MenuItem
                    key={item.layout}
                    size="300"
                    variant={captionPosition === item.layout ? 'Primary' : 'Surface'}
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

function SelectMessageSpacing() {
  const [menuCords, setMenuCords] = useState<RectCords>();
  const [messageSpacing, setMessageSpacing] = useSetting(settingsAtom, 'messageSpacing');
  const messageSpacingItems = useMessageSpacingItems();

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSelect = (layout: MessageSpacing) => {
    setMessageSpacing(layout);
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
          {messageSpacingItems.find((i) => i.spacing === messageSpacing)?.name ?? messageSpacing}
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
                {messageSpacingItems.map((item) => (
                  <MenuItem
                    key={item.spacing}
                    size="300"
                    variant={messageSpacing === item.spacing ? 'Primary' : 'Surface'}
                    radii="300"
                    onClick={() => handleSelect(item.spacing)}
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

function SelectRightSwipeAction({ disabled }: Readonly<{ disabled?: boolean }>) {
  const [menuCords, setMenuCords] = useState<RectCords>();
  const [action, setAction] = useSetting(settingsAtom, 'rightSwipeAction');

  const options = [
    { id: RightSwipeAction.Reply, name: 'Reply to Message' },
    { id: RightSwipeAction.Members, name: 'Open Member List' },
  ];

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSelect = (val: RightSwipeAction) => {
    setAction(val);
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
        disabled={disabled}
        after={<Icon size="300" src={Icons.ChevronBottom} />}
        onClick={handleMenu}
      >
        <Text size="T300">{options.find((o) => o.id === action)?.name ?? action}</Text>
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
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu>
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                {options.map((option) => (
                  <MenuItem
                    key={option.id}
                    size="300"
                    variant={action === option.id ? 'Primary' : 'Surface'}
                    radii="300"
                    onClick={() => handleSelect(option.id)}
                  >
                    <Text size="T300">{option.name}</Text>
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

function Gestures({ isMobile }: Readonly<{ isMobile: boolean }>) {
  const [mobileGestures, setMobileGestures] = useSetting(settingsAtom, 'mobileGestures');

  return (
    <Box direction="Column" gap="100" style={{ opacity: isMobile ? 1 : 0.5 }}>
      <Text size="L400">Gestures {!isMobile && '(Mobile Only)'}</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Enable Swiping"
          focusId="enable-swiping"
          description="Swipe left for rooms, swipe right for actions."
          after={
            <Switch
              variant="Primary"
              value={mobileGestures}
              onChange={setMobileGestures}
              disabled={!isMobile}
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Right Swipe Action"
          focusId="right-swipe-action"
          description="What happens when you swipe right on a message."
          after={<SelectRightSwipeAction disabled={!isMobile || !mobileGestures} />}
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
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Show Call Button for Large Rooms"
          focusId="large-room-call-button"
          after={
            <Switch
              variant="Primary"
              value={alwaysShowCallButton}
              onChange={setAlwaysShowCallButton}
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Join voice calls by just clicking the room's icon"
          focusId="join-on-click-voicecalls"
          after={
            <Switch
              variant="Primary"
              value={joinCallOnSingleClick}
              onChange={setjoinCallOnSingleClick}
            />
          }
        />
      </SequenceCard>
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
  const [hideMembershipInReadOnly, setHideMembershipInReadOnly] = useSetting(
    settingsAtom,
    'hideMembershipInReadOnly'
  );

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
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Disable Media Auto Load"
          focusId="disable-media-auto-load"
          after={
            <Switch
              variant="Primary"
              value={!mediaAutoLoad}
              onChange={(v) => setMediaAutoLoad(!v)}
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Hide Membership Change"
          focusId="hide-membership-change"
          after={
            <Switch
              variant="Primary"
              value={hideMembershipEvents}
              onChange={setHideMembershipEvents}
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Hide Profile Change"
          focusId="hide-profile-change"
          after={
            <Switch
              variant="Primary"
              value={hideNickAvatarEvents}
              onChange={setHideNickAvatarEvents}
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Hide Member Events in Read-Only Rooms"
          focusId="hide-member-events-read-only-rooms"
          after={
            <Switch
              variant="Primary"
              value={hideMembershipInReadOnly}
              onChange={setHideMembershipInReadOnly}
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Show Hidden Events"
          focusId="show-hidden-events"
          after={
            <Switch
              variant="Primary"
              value={showHiddenEvents}
              onChange={setShowHiddenEvents}
              title={
                showHiddenEvents
                  ? 'Disable to hide hidden events'
                  : 'Enable to show hidden events, this will cause visual clutter in busy rooms.'
              }
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Show Tombstones for Redacted Messages"
          focusId="show-redacted-message-tombstones"
          after={
            <Switch
              variant="Primary"
              value={showTombstoneEvents || showHiddenEvents}
              onChange={setShowTombstoneEvents}
              disabled={showHiddenEvents}
              title={getTombstoneSettingToggleTitle(showHiddenEvents, showTombstoneEvents)}
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
  const [encClientUrlPreview, setEncClientUrlPreview] = useSetting(
    settingsAtom,
    'encClientUrlPreview'
  );
  const [clientPreviewYoutube, setClientPreviewYoutube] = useSetting(
    settingsAtom,
    'clientPreviewYoutube'
  );
  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Embeds</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Display Multiple Embeds"
          focusId="display-multiple-embeds"
          description="Display the embeds of all the links. Turning it off makes it only show the embed of the 1st item"
          after={
            <Switch variant="Primary" value={multiplePreviews} onChange={setMultiplePreviews} />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Display Bundled Embeds"
          focusId="display-bundled-embeds"
          description="Show embeds when provided by the message itself. The embeds may be fabricated or incorrect."
          after={<Switch variant="Primary" value={bundledPreview} onChange={setBundledPreview} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Server-side Embeds"
          focusId="url-preview"
          description="Send the links from inside the messages to your homeserver to generate previews of the linked pages."
          after={<Switch variant="Primary" value={urlPreview} onChange={setUrlPreview} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Server-side Embeds in Encrypted Room"
          focusId="encrypted-room-url-preview"
          description="Request server-side embeds in E2EE chats. This partially decreases secrecy by revealing sent links to your homeserver"
          after={<Switch variant="Primary" value={encUrlPreview} onChange={setEncUrlPreview} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Client-side Embeds"
          focusId="client-side-embeds"
          description="Attempt to preview supported urls (e.g. YouTube) on the client, without involving the homeserver. This will expose your IP Address to third party services."
          after={
            <Switch
              variant="Primary"
              value={clientUrlPreview}
              onChange={setClientUrlPreview}
              title={clientUrlPreview ? 'Disable client-side embeds' : 'Enable client-side embeds'}
            />
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        style={clientUrlPreview ? {} : { display: 'none' }}
      >
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
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        style={clientUrlPreview ? {} : { display: 'none' }}
      >
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
    </Box>
  );
}

export function Sync() {
  const clientConfig = useClientConfig();
  const sessions = useAtomValue(sessionsAtom);
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const setSessions = useSetAtom(sessionsAtom);
  const activeSession = sessions.find((s) => s.userId === activeSessionId) ?? sessions[0];

  const serverSlidingEnabled = resolveSlidingEnabled(clientConfig.slidingSync?.enabled);
  const useSlidingSync = activeSession?.slidingSyncOptIn === true;

  const handleSetSlidingSync = (value: boolean) => {
    if (!activeSession) return;
    setSessions({
      type: 'PUT',
      session: {
        ...activeSession,
        slidingSyncOptIn: value,
      },
    });
    window.location.reload();
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400" style={{ opacity: serverSlidingEnabled ? 1 : 0.5 }}>
        Sync
      </Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        style={{ opacity: serverSlidingEnabled ? 1 : 0.5 }}
      >
        <SettingTile
          title="Use Sliding Sync"
          focusId="use-sliding-sync"
          description={
            serverSlidingEnabled ? (
              <>
                Enable Sliding Sync for this current login/session. Requires server support and
                admin configuration.{' '}
                <a
                  href="https://github.com/matrix-org/matrix-spec-proposals/blob/erikj/sss/proposals/4186-simplified-sliding-sync.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  More info/Documentation
                </a>
                .{' '}
                <a
                  href="https://github.com/SableClient/Sable/issues/39"
                  target="_blank"
                  rel="noreferrer"
                >
                  Known issues (Sable GitHub)
                </a>
                .
              </>
            ) : (
              <>
                Unavailable: the server has disabled Sliding Sync in its config.{' '}
                <a
                  href="https://github.com/matrix-org/matrix-spec-proposals/blob/erikj/sss/proposals/4186-simplified-sliding-sync.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  More info
                </a>
                .
              </>
            )
          }
          after={
            <Switch
              variant="Primary"
              value={useSlidingSync}
              onChange={handleSetSlidingSync}
              disabled={!serverSlidingEnabled}
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}

type GeneralProps = {
  requestBack?: () => void;
  requestClose: () => void;
};

function SettingsSyncSection() {
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
    error: 'Sync failed — will retry on next change',
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Settings Sync & Backup</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Sync across devices"
          focusId="sync-across-devices"
          description="Store your settings in your Matrix account so they follow you to any Sable instance. Notification and zoom preferences are kept per-device."
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
          before={<Icon src={Icons.Download} size="100" />}
          onClick={() => exportSettingsAsJson(fullSettings)}
        >
          <Text size="B300">Export Settings</Text>
        </Button>
        <Button
          variant="Secondary"
          fill="Soft"
          size="300"
          radii="300"
          before={<Icon src={Icons.ArrowTop} size="100" />}
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
          before={<Icon src={Icons.Shield} size="100" filled />}
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
              <Gestures isMobile={mobileOrTablet()} />
              <Editor isMobile={mobileOrTablet()} />
              <Messages />
              <Embeds />
              <Calls />
              <SettingsSyncSection />
              <DiagnosticsAndPrivacy />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
