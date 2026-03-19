import { MouseEventHandler, useState } from 'react';
import {
  Box,
  Button,
  config,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Scroll,
  Switch,
  Text,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { Page, PageContent, PageHeader } from '$components/page';
import { SequenceCard } from '$components/sequence-card';
import { useSetting } from '$state/hooks/settings';
import { JumboEmojiSize, settingsAtom } from '$state/settings';
import { SettingTile } from '$components/setting-tile';
import { stopPropagation } from '$utils/keyboard';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { Appearance } from './Themes';

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

function JumboEmoji() {
  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Jumbo Emoji</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Jumbo Emoji Size"
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
          description="Blurs images and videos in the timeline."
          after={<Switch variant="Primary" value={privacyBlur} onChange={setPrivacyBlur} />}
        />
      </SequenceCard>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Blur Avatars"
          description="Blurs user profile pictures and room icons."
          after={
            <Switch variant="Primary" value={privacyBlurAvatars} onChange={setPrivacyBlurAvatars} />
          }
        />
      </SequenceCard>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Blur Emotes"
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
          description="Display user pronouns in the message timeline."
          after={<Switch variant="Primary" value={showPronouns} onChange={setShowPronouns} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Pronoun Pills for All"
          description="Attempts to convert pronouns in names into pills (e.g. [they/them] or (it/its) turns into a pill)."
          after={<Switch variant="Primary" value={parsePronouns} onChange={setParsePronouns} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Render Global Username Colors"
          description="Display the username colors anyone can set in their account settings."
          after={
            <Switch variant="Primary" value={renderGlobalColors} onChange={setRenderGlobalColors} />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Render Space/Room Username Colors"
          description="Display the username colors that can be set with /color."
          after={
            <Switch variant="Primary" value={renderRoomColors} onChange={setRenderRoomColors} />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Render Space/Room Fonts"
          description="Display the username fonts that can be set with /font."
          after={<Switch variant="Primary" value={renderRoomFonts} onChange={setRenderRoomFonts} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Consistent Icon Style"
          description="Harmonize icon appearance with background fill"
          after={<Switch variant="Primary" value={uniformIcons} onChange={setUniformIcons} />}
        />
      </SequenceCard>
    </Box>
  );
}

type CosmeticsProps = {
  requestClose: () => void;
};

export function Cosmetics({ requestClose }: CosmeticsProps) {
  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              Appearance
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <Appearance />
              <IdentityCosmetics />
              <JumboEmoji />
              <Privacy />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
