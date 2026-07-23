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
import { SettingsSectionPage } from '../SettingsSectionPage';
import { Appearance } from './Themes';
import { LanguageSpecificPronouns } from './LanguageSpecificPronouns';
import { useTranslation } from 'react-i18next';

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

function SelectJumboEmojiSize() {
  const { t } = useTranslation('settings/appearance');

  const emojiSizeItems = [
    { id: 'none', name: t('none_same_size_as_text') },
    { id: 'extraSmall', name: t('extra_small') },
    { id: 'small', name: t('small') },
    { id: 'normal', name: t('normal') },
    { id: 'large', name: t('large') },
    { id: 'extraLarge', name: t('extra_large') },
  ];

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

function SelectRenderCustomProfileCards() {
  const { t } = useTranslation('settings/appearance');
  const profileCardRenderItems: { id: RenderUserCardsMode; name: string }[] = [
    { id: 'both', name: t('light_and_dark') },
    { id: 'light', name: t('light_only') },
    { id: 'dark', name: t('dark_only') },
    { id: 'none', name: t('off') },
  ];

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
    profileCardRenderItems.find((i) => i.id === renderUserCardsMode)?.name ?? t('light_and_dark');

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
  const { t } = useTranslation('settings/appearance');
  return (
    <Box direction="Column" gap="100">
      <Text size="L400">{t('jumbo_emoji')}</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('jumbo_emoji_size')}
          focusId="jumbo-emoji-size"
          description={t('adjust_the_size_of_emojis_sent_without_text')}
          after={<SelectJumboEmojiSize />}
        />
      </SequenceCard>
    </Box>
  );
}

function Privacy() {
  const { t } = useTranslation('settings/appearance');
  const [privacyBlur, setPrivacyBlur] = useSetting(settingsAtom, 'privacyBlur');
  const [privacyBlurAvatars, setPrivacyBlurAvatars] = useSetting(
    settingsAtom,
    'privacyBlurAvatars'
  );
  const [privacyBlurEmotes, setPrivacyBlurEmotes] = useSetting(settingsAtom, 'privacyBlurEmotes');

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">{t('privacy_and_security')}</Text>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('blur_media')}
          focusId="blur-media"
          description={t('blurs_images_and_videos_in_the_timeline')}
          after={<Switch variant="Primary" value={privacyBlur} onChange={setPrivacyBlur} />}
        />
      </SequenceCard>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('blur_avatars')}
          focusId="blur-avatars"
          description={t('blurs_user_profile_pictures_and_room_icons')}
          after={
            <Switch variant="Primary" value={privacyBlurAvatars} onChange={setPrivacyBlurAvatars} />
          }
        />
      </SequenceCard>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('blur_emotes')}
          focusId="blur-emotes"
          description={t('blurs_emoticons_within_messages')}
          after={
            <Switch variant="Primary" value={privacyBlurEmotes} onChange={setPrivacyBlurEmotes} />
          }
        />
      </SequenceCard>
    </Box>
  );
}

function IdentityCosmetics() {
  const { t } = useTranslation('settings/appearance');
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
      <Text size="L400">{t('identity')}</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('colorful_names')}
          focusId="colorful-names"
          description={t(
            'assign_unique_colors_to_users_based_on_their_id_does_not_override_room_spac'
          )}
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
          title={t('show_pronoun_pills')}
          focusId="show-pronoun-pills"
          description={t('display_user_pronouns_in_the_message_timeline')}
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
          title={t('max_pronoun_pills')}
          focusId="pronoun-pill-max-count"
          description={t('maximum_number_of_pronoun_pills')}
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
          title={t('max_pronoun_pill_length')}
          focusId="pronoun-pill-max-length"
          description={t('maximum_pronoun_pill_length')}
          after={<PronounPillMaxLengthInput disabled={!showPronouns} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('pronoun_pills_for_all')}
          focusId="pronoun-pills-for-all"
          description={t(
            'attempts_to_convert_pronouns_in_names_into_pills_e_g_they_them_or_it_its_tu'
          )}
          after={<Switch variant="Primary" value={parsePronouns} onChange={setParsePronouns} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('render_custom_profile_cards')}
          focusId="custom-profile-cards"
          description={t(
            'choose_whose_profile_card_colors_to_show_everyone_with_a_scheme_only_light'
          )}
          after={<SelectRenderCustomProfileCards />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('render_global_username_colors')}
          focusId="render-global-username-colors"
          description={t('display_the_username_colors_anyone_can_set_in_their_account_settings')}
          after={
            <Switch variant="Primary" value={renderGlobalColors} onChange={setRenderGlobalColors} />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('render_space_room_username_colors')}
          focusId="render-space-room-username-colors"
          description={t('display_the_username_colors_that_can_be_set_with_color')}
          after={
            <Switch variant="Primary" value={renderRoomColors} onChange={setRenderRoomColors} />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('render_space_room_fonts')}
          focusId="render-space-room-fonts"
          description={t('display_the_username_fonts_that_can_be_set_with_font')}
          after={<Switch variant="Primary" value={renderRoomFonts} onChange={setRenderRoomFonts} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('consistent_icon_style')}
          focusId="consistent-icon-style"
          description={t('harmonize_icon_appearance_with_background_fill')}
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
