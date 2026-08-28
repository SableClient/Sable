import { useRef } from 'react';
import { Box, config, Scroll, Text, toRem } from 'folds';
import { PageContent, SettingsSectionPage } from '$components/page';
import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { SettingTile, SettingToggle } from '$components/setting-tile';
import { SettingMenuSelector } from '$components/setting-menu-selector';

function MotionPreferences() {
  const [reducedMotion, setReducedMotion] = useSetting(settingsAtom, 'reducedMotion');
  const [autoplayGifs, setAutoplayGifs] = useSetting(settingsAtom, 'autoplayGifs');
  const [autoplayStickers, setAutoplayStickers] = useSetting(settingsAtom, 'autoplayStickers');
  const [autoplayEmojis, setAutoplayEmojis] = useSetting(settingsAtom, 'autoplayEmojis');

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Motion</Text>
      <SettingToggle
        title="Reduced Motion"
        focusId="reduced-motion"
        description="Stops animations and sliding UI elements."
        value={reducedMotion}
        onChange={setReducedMotion}
      />
      <SettingToggle
        title="Autoplay GIFs"
        focusId="autoplay-gifs"
        description="Automatically play animated image uploads and links."
        value={autoplayGifs}
        onChange={setAutoplayGifs}
      />
      <SettingToggle
        title="Autoplay Stickers"
        focusId="autoplay-stickers"
        description="Automatically play animated stickers."
        value={autoplayStickers}
        onChange={setAutoplayStickers}
      />
      <SettingToggle
        title="Autoplay Emojis"
        focusId="autoplay-emojis"
        description="Automatically play animated custom emojis."
        value={autoplayEmojis}
        onChange={setAutoplayEmojis}
      />
    </Box>
  );
}

function TextColorPreferences() {
  const [saturation, setSaturation] = useSetting(settingsAtom, 'saturationLevel');
  const [underlineLinks, setUnderlineLinks] = useSetting(settingsAtom, 'underlineLinks');

  const [renderGlobalColors, setRenderGlobalColors] = useSetting(
    settingsAtom,
    'renderGlobalNameColors'
  );
  const [renderRoomColors, setRenderRoomColors] = useSetting(settingsAtom, 'renderRoomColors');
  const [renderPersonaColors, setRenderPersonaColors] = useSetting(
    settingsAtom,
    'renderPersonaColors'
  );
  const [nameColorLightnessCorrection, setNameColorLightnessCorrection] = useSetting(
    settingsAtom,
    'nameColorLightnessCorrection'
  );
  const [renderRoomFonts, setRenderRoomFonts] = useSetting(settingsAtom, 'renderRoomFonts');

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Text and Color</Text>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Saturation"
          focusId="saturation"
          description={`${saturation}%`}
          after={
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={saturation}
              onChange={(e) => setSaturation(Number.parseInt(e.target.value, 10))}
              style={{
                width: toRem(160),
                cursor: 'pointer',
                appearance: 'none',
                height: toRem(6),
                borderRadius: config.radii.Pill,
                backgroundColor: 'var(--sable-surface-container-line)',
                accentColor: 'var(--sable-primary-main)',
              }}
            />
          }
        />
      </SequenceCard>

      <SettingToggle
        title="Render Global Username Colors"
        focusId="render-global-username-colors"
        description="Display the username colors anyone can set in their account settings."
        value={renderGlobalColors}
        onChange={setRenderGlobalColors}
      />
      <SettingToggle
        title="Render Space/Room Username Colors"
        focusId="render-space-room-username-colors"
        description="Display the username colors that can be set with /color."
        value={renderRoomColors}
        onChange={setRenderRoomColors}
      />
      <SettingToggle
        title="Render Persona Username Colors"
        focusId="render-persona-username-colors"
        description="Display the username colors that can be set on personas."
        value={renderPersonaColors}
        onChange={setRenderPersonaColors}
      />
      <SettingToggle
        title="Render Space/Room Fonts"
        focusId="render-space-room-fonts"
        description="Display the username fonts that can be set with /font."
        value={renderRoomFonts}
        onChange={setRenderRoomFonts}
      />
      <SettingToggle
        title="Underline Links"
        focusId="underline-links"
        description="Always show underlines on links in chat, bios and room descriptions."
        value={underlineLinks}
        onChange={setUnderlineLinks}
      />

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Name color contrast correction"
          focusId="name-color-lightness-correction"
          description="Automatically correct the lightness of colors to be more readable."
          after={
            <SettingMenuSelector
              value={nameColorLightnessCorrection}
              options={[
                { value: 'off', label: 'None' },
                { value: 'weak', label: 'Weak' },
                { value: 'strong', label: 'Strong' },
              ]}
              onSelect={setNameColorLightnessCorrection}
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}

type AccessibilityProps = {
  requestBack?: () => void;
  requestClose: () => void;
};

export function Accessibility({ requestBack, requestClose }: AccessibilityProps) {
  const accessibilityScrollRef = useRef<HTMLDivElement | null>(null);

  return (
    <SettingsSectionPage
      title="Accessibility"
      requestBack={requestBack}
      requestClose={requestClose}
    >
      <Box grow="Yes">
        <Scroll ref={accessibilityScrollRef} hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <TextColorPreferences />
              <MotionPreferences />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
