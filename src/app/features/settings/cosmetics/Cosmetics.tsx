import { useEffect, useRef, useState } from 'react';
import type { MouseEventHandler } from 'react';
import type { RectCords } from 'folds';
import {
  Box,
  Button,
  config,
  Icon,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  Scroll,
  Switch,
  Text,
} from 'folds';
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
import { t } from 'i18next';

const emojiSizeItems = [
  { id: 'none', name: t('Settings.Cosmetics.none_same_size_as_text') },
  { id: 'extraSmall', name: t('Settings.Cosmetics.extra_small') },
  { id: 'small', name: t('Settings.Cosmetics.small') },
  { id: 'normal', name: t('Settings.Cosmetics.normal') },
  { id: 'large', name: t('Settings.Cosmetics.large') },
  { id: 'extraLarge', name: t('Settings.Cosmetics.extra_large') },
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
        after={<Icon size="300" src={Icons.ChevronBottom} />}
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
  { id: 'both', name: t('Settings.Cosmetics.light_and_dark') },
  { id: 'light', name: t('Settings.Cosmetics.light_only') },
  { id: 'dark', name: t('Settings.Cosmetics.dark_only') },
  { id: 'none', name: t('Settings.Cosmetics.off') },
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
    profileCardRenderItems.find((i) => i.id === renderUserCardsMode)?.name ?? t('Settings.Cosmetics.light_and_dark');

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
      <Text size="L400">{t('Settings.Cosmetics.jumbo_emoji')}</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Settings.Cosmetics.jumbo_emoji_size')}
          focusId="jumbo-emoji-size"
          description={t('Settings.Cosmetics.adjust_the_size_of_emojis_sent_without_text')}
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
      <Text size="L400">{t('Settings.Cosmetics.privacy_and_security')}</Text>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Settings.Cosmetics.blur_media')}
          focusId="blur-media"
          description={t('Settings.Cosmetics.blurs_images_and_videos_in_the_timeline')}
          after={<Switch variant="Primary" value={privacyBlur} onChange={setPrivacyBlur} />}
        />
      </SequenceCard>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Settings.Cosmetics.blur_avatars')}
          focusId="blur-avatars"
          description={t('Settings.Cosmetics.blurs_user_profile_pictures_and_room_icons')}
          after={
            <Switch variant="Primary" value={privacyBlurAvatars} onChange={setPrivacyBlurAvatars} />
          }
        />
      </SequenceCard>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Settings.Cosmetics.blur_emotes')}
          focusId="blur-emotes"
          description={t('Settings.Cosmetics.blurs_emoticons_within_messages')}
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
      <Text size="L400">{t('Settings.Cosmetics.identity')}</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Settings.Cosmetics.colorful_names')}
          focusId="colorful-names"
          description={t('Settings.Cosmetics.assign_unique_colors_to_users_based_on_their_id_does_not_override_room_spac')}
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
          title={t('Settings.Cosmetics.show_pronoun_pills')}
          focusId="show-pronoun-pills"
          description={t('Settings.Cosmetics.display_user_pronouns_in_the_message_timeline')}
          after={<Switch variant="Primary" value={showPronouns} onChange={setShowPronouns} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Settings.Cosmetics.pronoun_pills_for_all')}
          focusId="pronoun-pills-for-all"
          description={t('Settings.Cosmetics.attempts_to_convert_pronouns_in_names_into_pills_e_g_they_them_or_it_its_tu')}
          after={<Switch variant="Primary" value={parsePronouns} onChange={setParsePronouns} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Settings.Cosmetics.render_custom_profile_cards')}
          focusId="custom-profile-cards"
          description={t('Settings.Cosmetics.choose_whose_profile_card_colors_to_show_everyone_with_a_scheme_only_light')}
          after={<SelectRenderCustomProfileCards />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Settings.Cosmetics.render_global_username_colors')}
          focusId="render-global-username-colors"
          description={t('Settings.Cosmetics.display_the_username_colors_anyone_can_set_in_their_account_settings')}
          after={
            <Switch variant="Primary" value={renderGlobalColors} onChange={setRenderGlobalColors} />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Settings.Cosmetics.render_space_room_username_colors')}
          focusId="render-space-room-username-colors"
          description={t('Settings.Cosmetics.display_the_username_colors_that_can_be_set_with_color')}
          after={
            <Switch variant="Primary" value={renderRoomColors} onChange={setRenderRoomColors} />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Settings.Cosmetics.render_space_room_fonts')}
          focusId="render-space-room-fonts"
          description={t('Settings.Cosmetics.display_the_username_fonts_that_can_be_set_with_font')}
          after={<Switch variant="Primary" value={renderRoomFonts} onChange={setRenderRoomFonts} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Settings.Cosmetics.consistent_icon_style')}
          focusId="consistent-icon-style"
          description={t('Settings.Cosmetics.harmonize_icon_appearance_with_background_fill')}
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
