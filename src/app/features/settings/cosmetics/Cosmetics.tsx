import { useEffect, useRef, useState } from 'react';
import type { ChangeEventHandler, KeyboardEventHandler, MouseEventHandler } from 'react';
import type { RectCords } from 'folds';
import {
  Box,
  Button,
  config,
  Input,
  Menu,
  MenuItem,
  PopOut,
  Scroll,
  Switch,
  Text,
  toRem,
} from 'folds';
import { CaretDown, composerIcon } from '$components/icons/phosphor';
import { isKeyHotkey } from 'is-hotkey';
import FocusTrap from 'focus-trap-react';
import { PageContent } from '$components/page';
import { SequenceCard } from '$components/sequence-card';
import { useSetting } from '$state/hooks/settings';
import type { JumboEmojiSize, RenderUserCardsMode } from '$state/settings';
import { settingsAtom } from '$state/settings';
import { SettingTile } from '$components/setting-tile';
import { stopPropagation } from '$utils/keyboard';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { SettingsSectionPage } from '$features/settings/SettingsSectionPage';
import { Appearance } from './Themes';
import { LanguageSpecificPronouns } from './LanguageSpecificPronouns';

function PronounPillMaxCountInput({ disabled }: { disabled: boolean }) {
  const [maxCount, setMaxCount] = useSetting(settingsAtom, 'pronounPillMaxCount');
  const [inputValue, setInputValue] = useState(maxCount.toString());

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const val = evt.target.value;
    setInputValue(val);

    const parsed = Number.parseInt(val, 10);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 10) {
      setMaxCount(parsed);
    }
  };

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (evt) => {
    if (isKeyHotkey('escape', evt)) {
      evt.stopPropagation();
      setInputValue(maxCount.toString());
      (evt.target as HTMLInputElement).blur();
    }

    if (isKeyHotkey('enter', evt)) {
      (evt.target as HTMLInputElement).blur();
    }
  };

  return (
    <Input
      style={{ width: toRem(80) }}
      variant={Number.parseInt(inputValue, 10) === maxCount ? 'Secondary' : 'Success'}
      size="300"
      radii="300"
      type="number"
      min="1"
      max="10"
      value={inputValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      outlined
    />
  );
}

function PronounPillMaxLengthInput({ disabled }: { disabled: boolean }) {
  const [maxLength, setMaxLength] = useSetting(settingsAtom, 'pronounPillMaxLength');
  const [inputValue, setInputValue] = useState(maxLength.toString());

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const val = evt.target.value;
    setInputValue(val);

    const parsed = Number.parseInt(val, 10);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 64) {
      setMaxLength(parsed);
    }
  };

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (evt) => {
    if (isKeyHotkey('escape', evt)) {
      evt.stopPropagation();
      setInputValue(maxLength.toString());
      (evt.target as HTMLInputElement).blur();
    }

    if (isKeyHotkey('enter', evt)) {
      (evt.target as HTMLInputElement).blur();
    }
  };

  return (
    <Input
      style={{ width: toRem(80) }}
      variant={Number.parseInt(inputValue, 10) === maxLength ? 'Secondary' : 'Success'}
      size="300"
      radii="300"
      type="number"
      min="1"
      max="64"
      value={inputValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      outlined
    />
  );
}

function IconSizePxInput({
  settingKey,
  disabled,
}: {
  settingKey: 'iconCompactSizePx' | 'iconInlineSizePx' | 'iconToolbarSizePx' | 'iconEmptySizePx';
  disabled?: boolean;
}) {
  const [sizePx, setSizePx] = useSetting(settingsAtom, settingKey);
  const [inputValue, setInputValue] = useState(sizePx.toString());

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const val = evt.target.value;
    setInputValue(val);

    const parsed = Number.parseInt(val, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      setSizePx(parsed);
    }
  };

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (evt) => {
    if (isKeyHotkey('escape', evt)) {
      evt.stopPropagation();
      setInputValue(sizePx.toString());
      (evt.target as HTMLInputElement).blur();
    }

    if (isKeyHotkey('enter', evt)) {
      (evt.target as HTMLInputElement).blur();
    }
  };

  return (
    <Input
      style={{ width: toRem(80) }}
      variant={Number.parseInt(inputValue, 10) === sizePx ? 'Secondary' : 'Success'}
      size="300"
      radii="300"
      type="number"
      min="0"
      value={inputValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      outlined
    />
  );
}

function IconSizeSettings() {
  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Icon Sizes</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Compact Icon Size"
          focusId="icon-compact-size"
          description="Small icons such as profile chips (default 16px)."
          after={<IconSizePxInput settingKey="iconCompactSizePx" />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Inline Icon Size"
          focusId="icon-inline-size"
          description="Menu items and timeline events (default 20px)."
          after={<IconSizePxInput settingKey="iconInlineSizePx" />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Toolbar Icon Size"
          focusId="icon-toolbar-size"
          description="Composer controls and header icons (default 24px)."
          after={<IconSizePxInput settingKey="iconToolbarSizePx" />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Empty State Icon Size"
          focusId="icon-empty-size"
          description="Other stuff (default 32px)."
          after={<IconSizePxInput settingKey="iconEmptySizePx" />}
        />
      </SequenceCard>
    </Box>
  );
}

const emojiSizeItems = [
  { id: 'none', name: 'None (Same size as text)' },
  { id: 'extraSmall', name: 'Extra Small' },
  { id: 'small', name: 'Small' },
  { id: 'normal', name: 'Normal' },
  { id: 'large', name: 'Large' },
  { id: 'extraLarge', name: 'Extra Large' },
];

function SelectJumboEmojiSize() {
  const [menuCords, setMenuCords] = useState<RectCords>();
  const [jumboEmojiSize, setJumboEmojiSize] = useSetting(settingsAtom, 'jumboEmojiSize');

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSelect = (sizeId: string) => {
    setJumboEmojiSize(sizeId as JumboEmojiSize);
    setMenuCords(undefined);
  };

  const currentSizeName = emojiSizeItems.find((i) => i.id === jumboEmojiSize)?.name ?? 'Normal';

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
        <Text size="T300">{currentSizeName}</Text>
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
                {emojiSizeItems.map((item) => (
                  <MenuItem
                    key={item.id}
                    size="300"
                    variant={jumboEmojiSize === item.id ? 'Primary' : 'Surface'}
                    radii="300"
                    onClick={() => handleSelect(item.id)}
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

const profileCardRenderItems: { id: RenderUserCardsMode; name: string }[] = [
  { id: 'both', name: 'Light & dark' },
  { id: 'light', name: 'Light only' },
  { id: 'dark', name: 'Dark only' },
  { id: 'none', name: 'Off' },
];

function SelectRenderCustomProfileCards() {
  const [menuCords, setMenuCords] = useState<RectCords>();
  const [renderUserCardsMode, setRenderUserCardsMode] = useSetting(settingsAtom, 'renderUserCards');

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSelect = (mode: RenderUserCardsMode) => {
    setRenderUserCardsMode(mode);
    setMenuCords(undefined);
  };

  const currentLabel =
    profileCardRenderItems.find((i) => i.id === renderUserCardsMode)?.name ?? 'Light & dark';

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
        <Text size="T300">{currentLabel}</Text>
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
                {profileCardRenderItems.map((item) => (
                  <MenuItem
                    key={item.id}
                    size="300"
                    variant={renderUserCardsMode === item.id ? 'Primary' : 'Surface'}
                    radii="300"
                    onClick={() => handleSelect(item.id)}
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

function JumboEmoji() {
  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Jumbo Emoji</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Jumbo Emoji Size"
          focusId="jumbo-emoji-size"
          description="Adjust the size of emojis sent without text."
          after={<SelectJumboEmojiSize />}
        />
      </SequenceCard>
    </Box>
  );
}

function Privacy() {
  const [privacyBlur, setPrivacyBlur] = useSetting(settingsAtom, 'privacyBlur');
  const [privacyBlurAvatars, setPrivacyBlurAvatars] = useSetting(
    settingsAtom,
    'privacyBlurAvatars'
  );
  const [privacyBlurEmotes, setPrivacyBlurEmotes] = useSetting(settingsAtom, 'privacyBlurEmotes');

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Privacy & Security</Text>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Blur Media"
          focusId="blur-media"
          description="Blurs images and videos in the timeline."
          after={<Switch variant="Primary" value={privacyBlur} onChange={setPrivacyBlur} />}
        />
      </SequenceCard>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Blur Avatars"
          focusId="blur-avatars"
          description="Blurs user profile pictures and room icons."
          after={
            <Switch variant="Primary" value={privacyBlurAvatars} onChange={setPrivacyBlurAvatars} />
          }
        />
      </SequenceCard>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Blur Emotes"
          focusId="blur-emotes"
          description="Blurs emoticons within messages."
          after={
            <Switch variant="Primary" value={privacyBlurEmotes} onChange={setPrivacyBlurEmotes} />
          }
        />
      </SequenceCard>
    </Box>
  );
}

function IdentityCosmetics() {
  const [legacyUsernameColor, setLegacyUsernameColor] = useSetting(
    settingsAtom,
    'legacyUsernameColor'
  );
  const [showPronouns, setShowPronouns] = useSetting(settingsAtom, 'showPronouns');
  const [parsePronouns, setParsePronouns] = useSetting(settingsAtom, 'parsePronouns');
  const [renderGlobalColors, setRenderGlobalColors] = useSetting(
    settingsAtom,
    'renderGlobalNameColors'
  );
  const [renderRoomColors, setRenderRoomColors] = useSetting(settingsAtom, 'renderRoomColors');
  const [renderRoomFonts, setRenderRoomFonts] = useSetting(settingsAtom, 'renderRoomFonts');
  const [uniformIcons, setUniformIcons] = useSetting(settingsAtom, 'uniformIcons');

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Identity</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Colorful Names"
          focusId="colorful-names"
          description="Assign unique colors to users based on their ID. Does not override room/space custom colors. Will override default role colors."
          after={
            <Switch
              variant="Primary"
              value={legacyUsernameColor}
              onChange={setLegacyUsernameColor}
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Show Pronoun Pills"
          focusId="show-pronoun-pills"
          description="Display user pronouns in the message timeline."
          after={<Switch variant="Primary" value={showPronouns} onChange={setShowPronouns} />}
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        style={{ opacity: showPronouns ? 1 : 0.5 }}
      >
        <SettingTile
          title="Max Pronoun Pills"
          focusId="pronoun-pill-max-count"
          description="Maximum number of pronoun pills shown per user in the timeline. Additional pronouns appear behind the ... pill."
          after={<PronounPillMaxCountInput disabled={!showPronouns} />}
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        style={{ opacity: showPronouns ? 1 : 0.5 }}
      >
        <SettingTile
          title="Max Pronoun Pill Length"
          focusId="pronoun-pill-max-length"
          description="Maximum characters shown in each pronoun pill before truncation."
          after={<PronounPillMaxLengthInput disabled={!showPronouns} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Pronoun Pills for All"
          focusId="pronoun-pills-for-all"
          description="Attempts to convert pronouns in names into pills (e.g. [they/them] or (it/its) turns into a pill)."
          after={<Switch variant="Primary" value={parsePronouns} onChange={setParsePronouns} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Render Custom Profile Cards"
          focusId="custom-profile-cards"
          description="Choose whose profile card colors to show: everyone with a scheme, only light or dark schemes, or hide them."
          after={<SelectRenderCustomProfileCards />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Render Global Username Colors"
          focusId="render-global-username-colors"
          description="Display the username colors anyone can set in their account settings."
          after={
            <Switch variant="Primary" value={renderGlobalColors} onChange={setRenderGlobalColors} />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Render Space/Room Username Colors"
          focusId="render-space-room-username-colors"
          description="Display the username colors that can be set with /color."
          after={
            <Switch variant="Primary" value={renderRoomColors} onChange={setRenderRoomColors} />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Render Space/Room Fonts"
          focusId="render-space-room-fonts"
          description="Display the username fonts that can be set with /font."
          after={<Switch variant="Primary" value={renderRoomFonts} onChange={setRenderRoomFonts} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Consistent Icon Style"
          focusId="consistent-icon-style"
          description="Harmonize icon appearance with background fill"
          after={<Switch variant="Primary" value={uniformIcons} onChange={setUniformIcons} />}
        />
      </SequenceCard>
    </Box>
  );
}

type CosmeticsProps = {
  requestBack?: () => void;
  requestClose: () => void;
};

export function Cosmetics({ requestBack, requestClose }: CosmeticsProps) {
  const [themeBrowserOpen, setThemeBrowserOpen] = useState(false);
  const appearanceScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let timeoutId: number | undefined;
    const el = appearanceScrollRef.current;

    if (themeBrowserOpen && el) {
      const scrollToTop = () => {
        el.scrollTop = 0;
      };

      scrollToTop();
      requestAnimationFrame(scrollToTop);
      timeoutId = window.setTimeout(scrollToTop, 0);
    }

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [themeBrowserOpen]);

  return (
    <SettingsSectionPage title="Appearance" requestBack={requestBack} requestClose={requestClose}>
      <Box grow="Yes">
        <Scroll ref={appearanceScrollRef} hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <Appearance onThemeBrowserOpenChange={setThemeBrowserOpen} />
              {!themeBrowserOpen && (
                <>
                  <IdentityCosmetics />
                  <IconSizeSettings />
                  <JumboEmoji />
                  <Privacy />
                  <LanguageSpecificPronouns />
                </>
              )}
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
