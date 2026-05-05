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
