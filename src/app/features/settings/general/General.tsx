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
  IconButton,
  Input,
  Menu,
  MenuItem,
  PopOut,
  Scroll,
  Switch,
  Text,
  toRem,
} from 'folds';
import {
  ArrowUp,
  CaretDown,
  composerIcon,
  Download,
  Info,
  menuIcon,
  Shield,
  X,
} from '$components/icons/phosphor';
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
import { isKeyHotkey } from 'is-hotkey';
import { settingsSyncLastSyncedAtom, settingsSyncStatusAtom } from '$hooks/useSettingsSync';
import { exportSettingsAsJson, importSettingsFromJson } from '$utils/settingsSync';
import { SettingsSectionPage } from '../SettingsSectionPage';
import { CallSoundSettings } from './CallSoundSettings';
import { useTranslation } from 'react-i18next';
import type { SettingMenuOption } from '$components/setting-menu-selector';
import { SettingMenuSelector } from '$components/setting-menu-selector';

type DateHintProps = {
  hasChanges: boolean;
  handleReset: () => void;
};
function DateHint({ hasChanges, handleReset }: Readonly<DateHintProps>) {
  const { t } = useTranslation(['settings/general', 'general']);
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
              <Text size="L400">{t('formatting')}</Text>
            </Header>

            <Box direction="Column">
              <Box style={categoryPadding} direction="Column">
                <Header size="300">
                  <Text size="L400">{t('year')}</Text>
                </Header>
                <Box direction="Column" tabIndex={0} gap="100">
                  <Text size="T300">
                    YY
                    <Text as="span" size="Inherit" priority="300">
                      {': '}
                      {t('two_digit_year')}
                    </Text>{' '}
                  </Text>
                  <Text size="T300">
                    YYYY
                    <Text as="span" size="Inherit" priority="300">
                      {': '}
                      {t('four_digit_year')}
                    </Text>
                  </Text>
                </Box>
              </Box>

              <Box style={categoryPadding} direction="Column">
                <Header size="300">
                  <Text size="L400">{t('month')}</Text>
                </Header>
                <Box direction="Column" tabIndex={0} gap="100">
                  <Text size="T300">
                    M
                    <Text as="span" size="Inherit" priority="300">
                      {': '}
                      {t('the_month')}
                    </Text>
                  </Text>
                  <Text size="T300">
                    MM
                    <Text as="span" size="Inherit" priority="300">
                      {': '}
                      {t('two_digit_month')}
                    </Text>{' '}
                  </Text>
                  <Text size="T300">
                    MMM
                    <Text as="span" size="Inherit" priority="300">
                      {': '}
                      {t('short_month_name')}
                    </Text>
                  </Text>
                  <Text size="T300">
                    MMMM
                    <Text as="span" size="Inherit" priority="300">
                      {': '}
                      {t('full_month_name')}
                    </Text>
                  </Text>
                </Box>
              </Box>

              <Box style={categoryPadding} direction="Column">
                <Header size="300">
                  <Text size="L400">{t('day_of_the_month')}</Text>
                </Header>
                <Box direction="Column" tabIndex={0} gap="100">
                  <Text size="T300">
                    D
                    <Text as="span" size="Inherit" priority="300">
                      {': '}
                      {t('day_of_the_month')}
                    </Text>
                  </Text>
                  <Text size="T300">
                    DD
                    <Text as="span" size="Inherit" priority="300">
                      {': '}
                      {t('two_digit_day_of_the_month')}
                    </Text>
                  </Text>
                </Box>
              </Box>
              <Box style={categoryPadding} direction="Column">
                <Header size="300">
                  <Text size="L400">{t('day_of_the_week')}</Text>
                </Header>
                <Box direction="Column" tabIndex={0} gap="100">
                  <Text size="T300">
                    d
                    <Text as="span" size="Inherit" priority="300">
                      {': '}
                      {t('day_of_the_week_sunday_0')}
                    </Text>
                  </Text>
                  <Text size="T300">
                    dd
                    <Text as="span" size="Inherit" priority="300">
                      {': '}
                      {t('two_letter_day_name')}
                    </Text>
                  </Text>
                  <Text size="T300">
                    ddd
                    <Text as="span" size="Inherit" priority="300">
                      {': '}
                      {t('short_day_name')}
                    </Text>
                  </Text>
                  <Text size="T300">
                    dddd
                    <Text as="span" size="Inherit" priority="300">
                      {': '}
                      {t('full_day_name')}
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
  const { t } = useTranslation(['settings/general', 'general']);
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
          <Text size="B400">{t('save', { ns: 'general' })}</Text>
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
  const [menuCords, setMenuCords] = useState<RectCords>();
  const dateFormatItems = useDateFormatItems();

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
        after={composerIcon(CaretDown)}
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
  const { t } = useTranslation(['settings/general']);

  const handlePresetChange = (format: string) => {
    setSelectedDateFormat(format);
    if (format !== '') {
      setDateFormatString(format);
    }
  };

  return (
    <>
      <SettingTile
        title={t('date_format')}
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
    return 'disable_to_hide_redacted_messages_entirely';
  }
  return 'enable_to_show_tombstone_events_for_redacted';
}

function DateAndTime() {
  const [hour24Clock, setHour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const { t } = useTranslation(['settings/general']);

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Date & Time</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('twenty_four_hour_time_format')}
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

function LanguageChange() {
  const { i18n } = useTranslation('general');
  const { t } = useTranslation(['settings/general']);

  const languageOptions: SettingMenuOption<string>[] = [
    { value: '', label: 'System' },
    { value: 'en', label: 'English' },
    { value: 'ro', label: 'Română' },
  ];
  const [curLanguage, setCurLanguage] = useState(localStorage.getItem('i18nextLng') ?? '');

  const handleLanguageChange = (language: string) => {
    if (language) {
      setCurLanguage(language);
      i18n.changeLanguage(language);
    } else {
      localStorage.removeItem('i18nextLng');
      setCurLanguage('');

      const detected = i18n.services.languageDetector?.detect();
      i18n.changeLanguage(Array.isArray(detected) ? detected[0] : (detected ?? 'en'));
    }
    window.location.reload();
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Language</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('current_language')}
          focusId="set-language"
          after={
            <SettingMenuSelector
              value={curLanguage ?? ''}
              options={languageOptions}
              onSelect={handleLanguageChange}
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}

function Editor() {
  const [enterForNewline, setEnterForNewline] = useSetting(settingsAtom, 'enterForNewline');
  const [editorToolbar, setEditorToolbar] = useSetting(settingsAtom, 'editorToolbar');
  const [editorOldAddFile, setEditorOldAddFile] = useSetting(settingsAtom, 'editorOldAddFile');
  const [hideActivity, setHideActivity] = useSetting(settingsAtom, 'hideActivity');
  const [hideReads, setHideReads] = useSetting(settingsAtom, 'hideReads');
  const [sendPresence, setSendPresence] = useSetting(settingsAtom, 'sendPresence');
  const [mentionInReplies, setMentionInReplies] = useSetting(settingsAtom, 'mentionInReplies');
  const [sendIndividualAttachmentAsCaption, setSendIndividualAttachmentAsCaption] = useSetting(
    settingsAtom,
    'sendIndividualAttachmentAsCaption'
  );
  const { t } = useTranslation(['settings/general']);

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">{t('Editor.editor')}</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
            title={t('Editor.enter_for_newline_title')}
          focusId="enter-for-newline"
            description={t('Editor.enter_for_newline_description', {
              keycombo: isMacOS() ? KeySymbol.Command : 'Ctrl',
            })}
          after={<Switch variant="Primary" value={enterForNewline} onChange={setEnterForNewline} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Editor.composer_formatting_toolbar_title')}
          focusId="composer-formatting-toolbar"
          description={t('Editor.composer_formatting_toolbar_description')}
          after={<Switch variant="Primary" value={editorToolbar} onChange={setEditorToolbar} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Editor.hide_add_menu_title')}
          focusId="hide-add-menu"
          description={t('Editor.hide_add_menu_description')}
          after={
            <Switch variant="Primary" value={editorOldAddFile} onChange={setEditorOldAddFile} />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Editor.hide_typing_indicators_title')}
          focusId="hide-typing-indicators"
          description={t('Editor.hide_typing_indicators_description')}
          after={<Switch variant="Primary" value={hideActivity} onChange={setHideActivity} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Editor.hide_read_receipts_title')}
          focusId="hide-read-receipts"
          description={t('Editor.hide_read_receipts_description')}
          after={<Switch variant="Primary" value={hideReads} onChange={setHideReads} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Editor.presence_status_title')}
          focusId="presence-status"
          description={t('Editor.presence_status_description')}
          after={<Switch variant="Primary" value={sendPresence} onChange={setSendPresence} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Editor.reply_notifications_title')}
          focusId="reply-notifications"
          description={t('Editor.reply_notifications_description')}
          after={
            <Switch variant="Primary" value={mentionInReplies} onChange={setMentionInReplies} />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Editor.individual_attachments_title')}
          focusId="individual-attachments"
          description={t('Editor.individual_attachments_description')}
          after={
            <Switch
              variant="Primary"
              value={sendIndividualAttachmentAsCaption}
              onChange={setSendIndividualAttachmentAsCaption}
            />
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
        after={composerIcon(CaretDown)}
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
        after={composerIcon(CaretDown)}
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
        after={composerIcon(CaretDown)}
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
        after={composerIcon(CaretDown)}
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
  const { t } = useTranslation(['settings/general']);

  return (
    <Box direction="Column" gap="100" style={{ opacity: isMobile ? 1 : 0.5 }}>
      <Text size="L400">
        {t('Gestures.gestures')}
        {!isMobile && t('Gestures.mobile_only')}
      </Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Gestures.enable_swiping_title')}
          focusId="enable-swiping"
          description={t('Gestures.enable_swiping_description')}
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
          title={t('Gestures.right_swipe_action_title')}
          focusId="right-swipe-action"
          description={t('Gestures.right_swipe_action_description')}
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
  const { t } = useTranslation(['settings/general']);
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
      <Text size="L400">{t('Calls.calls')}</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Calls.large_room_call_button_title')}
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
          title={t('Calls.join_on_click_voicecalls_title')}
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

  const [messageLayout] = useSetting(settingsAtom, 'messageLayout');
  const [rightBubbles, setRightBubbles] = useSetting(settingsAtom, 'useRightBubbles');
  const { t } = useTranslation(['settings/general']);

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">{t('Messages.messages')}</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Message Layout"
          focusId="message-layout"
          after={<SelectMessageLayout />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Messages.message_spacing_title')}
          focusId="message-spacing"
          after={<SelectMessageSpacing />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Messages.file_description_placement_title')}
          focusId="file-description-placement"
          after={<SelectCaptionPosition />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Messages.emoji_selector_threshold_title')}
          focusId="emoji-selector-threshold"
          after={<EmojiSelectorThresholdInput />}
        />
      </SequenceCard>
      {messageLayout === MessageLayout.Bubble && (
        <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
          <SettingTile
            title={t('Messages.right_aligned_bubbles_title')}
            focusId="right-aligned-bubbles"
            description={t('Messages.right_aligned_bubbles_description')}
            after={<Switch variant="Primary" value={rightBubbles} onChange={setRightBubbles} />}
          />
        </SequenceCard>
      )}
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Messages.disable_media_auto_load_title')}
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
          title={t('Messages.hide_membership_change_title')}
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
          title={t('Messages.hide_profile_change_title')}
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
          title={t('Messages.hide_member_events_read_only_rooms_title')}
          focusId="hide-member-events-read-only-rooms"
          description={t('Messages.hide_member_events_read_only_rooms_description')}
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
          title={t('Messages.show_hidden_events_title')}
          focusId="show-hidden-events"
          description={t('Messages.show_hidden_events_description')}
          after={
            <Switch
              variant="Primary"
              value={showHiddenEvents}
              onChange={setShowHiddenEvents}
              title={
                showHiddenEvents
                  ? t('Messages.show_hidden_events_disable')
                  : t('Messages.show_hidden_events_enable')
              }
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
          title={t('Messages.hidden_event_edits_title')}
          focusId="hidden-event-edits"
          description={t('Messages.hidden_event_edits_description')}
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
          title={t('Messages.show_redacted_message_tombstones_title')}
          focusId="show-redacted-message-tombstones"
          description={t('Messages.show_redacted_message_tombstones_description')}
          after={
            <Switch
              variant="Primary"
              value={showTombstoneEvents}
              onChange={setShowTombstoneEvents}
              title={t(getTombstoneSettingToggleTitle(showTombstoneEvents))}
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
          title={t('Messages.hidden_event_redaction_timeline_title')}
          focusId="hidden-event-redaction-timeline"
          description={t('Messages.hidden_event_redaction_timeline_description')}
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
          title={t('Messages.hidden_event_reactions_title')}
          focusId="hidden-event-reactions"
          description={t('Messages.hidden_event_reactions_description')}
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
          title={t('Messages.hidden_event_reaction_tombstones_title')}
          focusId="hidden-event-reaction-tombstones"
          description={t('Messages.hidden_event_reaction_tombstones_description')}
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
          title={t('Messages.hidden_event_reaction_redaction_timeline_title')}
          focusId="hidden-event-reaction-redaction-timeline"
          description={t('Messages.hidden_event_reaction_redaction_timeline_description')}
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
          title={t('Messages.hidden_event_other_title')}
          focusId="hidden-event-other"
          description={t('Messages.hidden_event_other_description')}
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
  const [enableGifPicker, setEnableGifPicker] = useSetting(settingsAtom, 'enableGifPicker');
  const { t } = useTranslation(['settings/general']);
  return (
    <Box direction="Column" gap="100">
      <Text size="L400">{t('Embeds.embeds')}</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Embeds.display_multiple_embeds_title')}
          focusId="display-multiple-embeds"
          description={t('Embeds.display_multiple_embeds_description')}
          after={
            <Switch variant="Primary" value={multiplePreviews} onChange={setMultiplePreviews} />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Embeds.display_bundled_embeds_title')}
          focusId="display-bundled-embeds"
          description={t('Embeds.display_bundled_embeds_description')}
          after={<Switch variant="Primary" value={bundledPreview} onChange={setBundledPreview} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Embeds.url_preview_title')}
          focusId="url-preview"
          description={t('Embeds.url_preview_description')}
          after={<Switch variant="Primary" value={urlPreview} onChange={setUrlPreview} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Embeds.encrypted_room_url_preview_title')}
          focusId="encrypted-room-url-preview"
          description={t('Embeds.encrypted_room_url_preview_description')}
          after={<Switch variant="Primary" value={encUrlPreview} onChange={setEncUrlPreview} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Embeds.client_side_embeds_title')}
          focusId="client-side-embeds"
          description={t('Embeds.client_side_embeds_description')}
          after={
            <Switch
              variant="Primary"
              value={clientUrlPreview}
              onChange={setClientUrlPreview}
              title={
                clientUrlPreview
                  ? t('Embeds.client_side_embeds_disable')
                  : t('Embeds.client_side_embeds_enable')
              }
            />
          }
        />
      </SequenceCard>
      {clientUrlPreview && (
        <>
          <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
            <SettingTile
              title={t('Embeds.encrypted_room_embeds_title')}
              focusId="encrypted-room-embeds"
              after={
                <Switch
                  variant="Primary"
                  value={encClientUrlPreview}
                  onChange={setEncClientUrlPreview}
                  title={
                    encClientUrlPreview
                      ? t('Embeds.encrypted_room_embeds_disable')
                      : t('Embeds.encrypted_room_embeds_enable')
                  }
                />
              }
            />
          </SequenceCard>
          <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
            <SettingTile
              title={t('Embeds.embed_youtube_links_title')}
              focusId="embed-youtube-links"
              after={
                <Switch
                  variant="Primary"
                  value={clientPreviewYoutube}
                  onChange={setClientPreviewYoutube}
                  title={
                    clientPreviewYoutube
                      ? t('Embeds.embed_youtube_links_disable')
                      : t('Embeds.embed_youtube_links_enable')
                  }
                />
              }
            />
          </SequenceCard>
        </>
      )}
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Embeds.enable_gif_picker_title')}
          focusId="enable-gif-picker"
          description={t('Embeds.enable_gif_picker_description')}
          after={
            <Switch
              variant="Primary"
              value={enableGifPicker}
              onChange={setEnableGifPicker}
              title={
                enableGifPicker
                  ? t('Embeds.enable_gif_picker_disable')
                  : t('Embeds.enable_gif_picker_enable')
              }
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Embeds.show_interactive_map_title')}
          focusId="show-interactive-map"
          description={t('Embeds.show_interactive_map_description')}
          after={
            <Switch
              variant="Primary"
              value={showInteractiveMap}
              onChange={setShowInteractiveMap}
              title={
                showInteractiveMap
                  ? t('Embeds.show_interactive_map_disable')
                  : t('Embeds.show_interactive_map_enable')
              }
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Embeds.show_interactive_map_enc_title')}
          focusId="show-interactive-map-enc"
          description={t('Embeds.show_interactive_map_enc_description')}
          after={
            <Switch
              variant="Primary"
              value={showEncInteractiveMap}
              onChange={setEncShowInteractiveMap}
              title={
                showEncInteractiveMap
                  ? t('Embeds.show_interactive_map_enc_disable')
                  : t('Embeds.show_interactive_map_enc_enable')
              }
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
  const { t } = useTranslation(['settings/general']);

  const [importError, setImportError] = useState<string | null>(null);

  const handleImport = async () => {
    setImportError(null);
    const merged = await importSettingsFromJson(fullSettings);
    if (merged === null) {
      setImportError(t('SettingsSync.sync_across_devices_invalid'));
      return;
    }
    setSettings(merged);
  };

  const syncStatusLabel: Record<typeof syncStatus, string> = {
    idle: lastSynced
      ? t('SettingsSync.sync_across_devices_existing', {
          time: dayjs(lastSynced).format('HH:mm:ss'),
        })
      : t('SettingsSync.sync_across_devices_uninitialized'),
    syncing: t('SettingsSync.sync_across_devices_syncing'),
    error: t('SettingsSync.sync_across_devices_error'),
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">{t('SettingsSync.settings_sync')}</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title={t('Sync.use_sliding_sync_title')}
          focusId="use-sliding-sync"
          description={
                t('Sync.use_sliding_sync_description')
          }
          
          after={
            <Switch variant="Primary" value={useSlidingSync} onChange={handleSetSlidingSync} />
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title={t('SettingsSync.sync_across_devices_title')}
          focusId="sync-across-devices"
          description={t('SettingsSync.sync_across_devices_description')}
          after={<Switch variant="Primary" value={syncEnabled} onChange={setSyncEnabled} />}
        />
        {syncEnabled && (
          <SettingTile
            focusId="sync-status"
            title={t('SettingsSync.sync_status_title')}
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
          <Text size="B300">{t('SettingsSync.sync_across_devices_export')}</Text>
        </Button>
        <Button
          variant="Secondary"
          fill="Soft"
          size="300"
          radii="300"
          before={menuIcon(ArrowUp)}
          onClick={handleImport}
        >
          <Text size="B300">{t('SettingsSync.sync_across_devices_import')}</Text>
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
  const { t } = useTranslation(['settings/general']);
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
      <Text size="L400">{t('DiagnosticsAndPriivacy.diagnostics_and_priivacy')}</Text>
      {needsRefresh && (
        <Box
          style={{
            padding: '12px',
            backgroundColor: 'rgba(33, 150, 243, 0.1)',
            borderRadius: '8px',
          }}
        >
          <Text size="T300" style={{ color: 'rgb(33, 150, 243)' }}>
            <Text size="L400">{t('DiagnosticsAndPriivacy.please_refresh')}</Text>
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
          title={t('DiagnosticsAndPriivacy.error_reporting_title')}
          focusId="error-reporting"
          description={
            isSentryConfigured
              ? t('DiagnosticsAndPriivacy.error_reporting_send')
              : t('DiagnosticsAndPriivacy.error_reporting_unimplemented')
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
            title={t('DiagnosticsAndPriivacy.session_replay_title')}
            focusId="session-replay"
            description={t('DiagnosticsAndPriivacy.session_replay_description')}
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
          before={menuIcon(Shield, { weight: 'fill' })}
        >
          <Text size="B300">{t('DiagnosticsAndPriivacy.privacy_policy')}</Text>
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
              <LanguageChange />
              <Gestures isMobile={mobileOrTablet()} />
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
