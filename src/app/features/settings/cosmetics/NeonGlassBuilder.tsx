import { useEffect, useCallback, useState } from 'react';
import { Box, Switch, Text, Line, config, Button, ProgressBar, Badge, toRem, Input, IconButton, Icon, Icons } from 'folds';
import { HexColorPicker } from 'react-colorful';
import { HexColorPickerPopOut } from '$components/HexColorPickerPopOut';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useDebounce } from '$hooks/useDebounce';
import { ThemeEngine, NEON_GLASS_DEFAULTS, type NeonGlassPrefs } from '../../../services/ThemeEngine';
import { SequenceCardStyle } from '$features/settings/styles.css';

// Color presets for quick access
const COLOR_PRESETS = [
  { name: 'Cyan', color: '#00f0ff' },
  { name: 'Magenta', color: '#ff006e' },
  { name: 'Purple', color: '#9d4edd' },
  { name: 'Lime', color: '#00ff41' },
  { name: 'Pink', color: '#ff10f0' },
  { name: 'Blue', color: '#0087ff' },
] as const;

/**
 * NeonGlassBuilder

 *
 * Live theme customisation panel for the "Neon Glass" aesthetic.
 * Integrates into the Cosmetics section of Appearance settings.
 */
export function NeonGlassBuilder() {
  const [enabled, setEnabled] = useSetting(settingsAtom, 'neonGlassEnabled');
  const [primaryColor, setPrimaryColor] = useSetting(settingsAtom, 'neonGlassPrimaryColor');
  const [blurRadius, setBlurRadius] = useSetting(settingsAtom, 'neonGlassBlur');
  const [bgOpacity, setBgOpacity] = useSetting(settingsAtom, 'neonGlassBgOpacity');
  const [chatOpacity, setChatOpacity] = useSetting(settingsAtom, 'neonGlassChatOpacity');
  const [glowRadius, setGlowRadius] = useSetting(settingsAtom, 'neonGlassGlow');
  const [bubbleGlow, setBubbleGlow] = useSetting(settingsAtom, 'neonGlassBubbleGlow');

  const [applySidebar, setApplySidebar] = useSetting(settingsAtom, 'neonGlassApplySidebar');
  const [applyChat, setApplyChat] = useSetting(settingsAtom, 'neonGlassApplyChat');
  const [applyModals, setApplyModals] = useSetting(settingsAtom, 'neonGlassApplyModals');
  const [applyReply, setApplyReply] = useSetting(settingsAtom, 'neonGlassApplyReply');

  // Local slider state for immediate UI feedback; debounced before hitting ThemeEngine
  const [localColor, setLocalColor] = useState(primaryColor ?? NEON_GLASS_DEFAULTS.primaryColor);
  const [localBlur, setLocalBlur] = useState(blurRadius ?? NEON_GLASS_DEFAULTS.blurRadius);
  const [localOpacity, setLocalOpacity] = useState(bgOpacity ?? NEON_GLASS_DEFAULTS.bgOpacity);
  const [localChatOpacity, setLocalChatOpacity] = useState(chatOpacity ?? NEON_GLASS_DEFAULTS.chatOpacity);
  const [localGlow, setLocalGlow] = useState(glowRadius ?? NEON_GLASS_DEFAULTS.glowRadius);
  const [localBubbleGlow, setLocalBubbleGlow] = useState(bubbleGlow ?? NEON_GLASS_DEFAULTS.bubbleGlow);

  // Debounced saves
  const debounceSaveColor = useDebounce(
    useCallback((v: string) => setPrimaryColor(v), [setPrimaryColor]),
    { wait: 50 }
  );
  const debounceSaveBlur = useDebounce(
    useCallback((v: number) => setBlurRadius(v), [setBlurRadius]),
    { wait: 50 }
  );
  const debounceSaveOpacity = useDebounce(
    useCallback((v: number) => setBgOpacity(v), [setBgOpacity]),
    { wait: 50 }
  );
  const debounceSaveChatOpacity = useDebounce(
    useCallback((v: number) => setChatOpacity(v), [setChatOpacity]),
    { wait: 50 }
  );
  const debounceSaveGlow = useDebounce(
    useCallback((v: number) => setGlowRadius(v), [setGlowRadius]),
    { wait: 50 }
  );
  const debounceSaveBubbleGlow = useDebounce(
    useCallback((v: number) => setBubbleGlow(v), [setBubbleGlow]),
    { wait: 50 }
  );

  const isSlow = localBlur > 20 || localGlow > 20;

  useEffect(() => {
    if (!enabled) {
      ThemeEngine.resetNeonGlass();
      return;
    }
    ThemeEngine.applyNeonGlass({
      primaryColor: localColor,
      blurRadius: localBlur,
      bgOpacity: localOpacity,
      chatOpacity: localChatOpacity,
      glowRadius: localGlow,
      bubbleGlow: localBubbleGlow,
      applySidebar,
      applyChat,
      applyModals,
      applyReply,
      enableTransition: true,
    });
  }, [enabled, localColor, localBlur, localOpacity, localChatOpacity, localGlow, localBubbleGlow, applySidebar, applyChat, applyModals, applyReply]);

  const handleColorUpdate = useCallback(
    (newColor: string) => {
      let sanitized = newColor.trim();
      sanitized = sanitized.startsWith('#') ? sanitized : `#${sanitized}`;
      setLocalColor(sanitized);
      if (/^#[0-9A-F]{6}$/i.test(sanitized)) {
        debounceSaveColor(sanitized);
      }
    },
    [debounceSaveColor]
  );

  const handlePresetColor = useCallback(
    (color: string) => {
      setLocalColor(color);
      debounceSaveColor(color);
    },
    [debounceSaveColor]
  );

  const handleResetToDefaults = useCallback(() => {
    setLocalColor(NEON_GLASS_DEFAULTS.primaryColor);
    setLocalBlur(NEON_GLASS_DEFAULTS.blurRadius);
    setLocalOpacity(NEON_GLASS_DEFAULTS.bgOpacity);
    setLocalChatOpacity(NEON_GLASS_DEFAULTS.chatOpacity);
    setLocalGlow(NEON_GLASS_DEFAULTS.glowRadius);
    setLocalBubbleGlow(NEON_GLASS_DEFAULTS.bubbleGlow);

    setPrimaryColor(NEON_GLASS_DEFAULTS.primaryColor);
    setBlurRadius(NEON_GLASS_DEFAULTS.blurRadius);
    setBgOpacity(NEON_GLASS_DEFAULTS.bgOpacity);
    setChatOpacity(NEON_GLASS_DEFAULTS.chatOpacity);
    setGlowRadius(NEON_GLASS_DEFAULTS.glowRadius);
    setBubbleGlow(NEON_GLASS_DEFAULTS.bubbleGlow);
    setApplyReply(NEON_GLASS_DEFAULTS.applyReply);
  }, [setPrimaryColor, setBlurRadius, setBgOpacity, setChatOpacity, setGlowRadius, setBubbleGlow, setApplyReply]);

  const handleExportTheme = useCallback(() => {
    const cssText = `/*
@sable-theme
---
id: custom-neon-glass-${Date.now()}
name: Custom Neon Glass Theme
author: NeonGlassBuilder
kind: dark
contrast: low
tags: neon, glassmorphism, generated
ng_color: ${localColor}
ng_blur: ${localBlur}
ng_opacity: ${localOpacity}
ng_chat_opacity: ${localChatOpacity}
ng_glow: ${localGlow}
ng_bubble_glow: ${localBubbleGlow}
ng_sidebar: ${applySidebar}
ng_chat: ${applyChat}
ng_modals: ${applyModals}
ng_reply: ${applyReply}
*/

:root {
  /* This theme relies on the Neon Glass settings overlay. */
}
`;
    const blob = new Blob([cssText], { type: 'text/css' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `custom-neon-glass-${new Date().toISOString().split('T')[0]}.sable.css`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [localColor, localBlur, localOpacity, localChatOpacity, localGlow, localBubbleGlow, applySidebar, applyChat, applyModals, applyReply]);

  const handleImportTheme = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.css,.sable.css';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        // Import using the metadata parser from ThemeCatalogSettings
        import('../../../theme/metadata').then(({ parseSableThemeMetadata }) => {
          const meta = parseSableThemeMetadata(text);
          if (meta.defaults?.neonGlass) {
            const ng = meta.defaults.neonGlass;
            if (ng.primaryColor) {
              setLocalColor(ng.primaryColor);
              setPrimaryColor(ng.primaryColor);
            }
            if (ng.blurRadius !== undefined) {
              setLocalBlur(ng.blurRadius);
              setBlurRadius(ng.blurRadius);
            }
            if (ng.bgOpacity !== undefined) {
              setLocalOpacity(ng.bgOpacity);
              setBgOpacity(ng.bgOpacity);
            }
            if (ng.chatOpacity !== undefined) {
              setLocalChatOpacity(ng.chatOpacity);
              setChatOpacity(ng.chatOpacity);
            }
            if (ng.glowRadius !== undefined) {
              setLocalGlow(ng.glowRadius);
              setGlowRadius(ng.glowRadius);
            }
            if (ng.bubbleGlow !== undefined) {
              setLocalBubbleGlow(ng.bubbleGlow);
              setBubbleGlow(ng.bubbleGlow);
            }
            if (ng.applySidebar !== undefined) setApplySidebar(ng.applySidebar);
            if (ng.applyChat !== undefined) setApplyChat(ng.applyChat);
            if (ng.applyModals !== undefined) setApplyModals(ng.applyModals);
            if (ng.applyReply !== undefined) setApplyReply(ng.applyReply);
            setEnabled(true);
          }
        }).catch(console.error);
      };
      reader.readAsText(file);
    };
    input.click();
  }, [
    setPrimaryColor,
    setBlurRadius,
    setBgOpacity,
    setChatOpacity,
    setGlowRadius,
    setBubbleGlow,
    setApplySidebar,
    setApplyChat,
    setApplyModals,
    setApplyReply,
    setEnabled,
  ]);

  const renderSlider = (
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void,
    ariaLabel: string
  ) => (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(Number.parseFloat(e.target.value))}
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
  );

  return (
    <Box direction="Column" gap="700">
      {/* Neon Glass Main Section */}
      <Box direction="Column" gap="100">
        <Text size="L400">Neon Glass</Text>

        {/* Live Preview Section */}
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          style={{
            background: 'var(--sable-surface-container)',
            backgroundImage: `radial-gradient(circle at 0% 0%, ${localColor}22 0%, transparent 50%)`,
            overflow: 'hidden',
            border: `1px solid var(--sable-surface-container-line)`,
            borderRadius: config.radii.R400,
          }}
        >
          <Text size="T200" priority="300" style={{ marginBottom: config.space.S200 }}>
            Live Preview
          </Text>
          <Box direction="Row" gap="200" style={{ height: 120 }}>
            {/* Mini Sidebar */}
            <Box
              direction="Column"
              gap="100"
              alignItems="Center"
              style={{
                width: 40,
                padding: config.space.S100,
                borderRadius: config.radii.R300,
                backdropFilter: applySidebar ? `blur(${localBlur}px)` : 'none',
                backgroundColor: applySidebar ? `rgba(20, 20, 30, ${localOpacity})` : 'var(--sable-surface-container-active)',
                border: applySidebar ? '1px solid rgba(255,255,255,0.1)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <Box
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: config.radii.R300,
                  backgroundColor: localColor,
                  boxShadow: `0 0 ${localGlow}px ${localColor}`,
                  transition: 'all 0.2s ease',
                }}
              />
              <Box style={{ width: 24, height: 24, borderRadius: config.radii.R300, backgroundColor: 'rgba(255,255,255,0.05)' }} />
              <Box style={{ width: 24, height: 24, borderRadius: config.radii.R300, backgroundColor: 'rgba(255,255,255,0.05)' }} />
            </Box>

            {/* Mini Chat */}
            <Box
              grow="Yes"
              direction="Column"
              gap="100"
              style={{
                padding: config.space.S200,
                borderRadius: config.radii.R300,
                backdropFilter: applyChat ? `blur(${localBlur}px)` : 'none',
                backgroundColor: applyChat ? `rgba(20, 20, 30, ${localOpacity})` : 'var(--sable-surface-container-active)',
                border: applyChat ? '1px solid rgba(255,255,255,0.1)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <Box style={{ width: '60%', height: 8, borderRadius: config.radii.R300, backgroundColor: 'rgba(255,255,255,0.2)' }} />
              <Box style={{ width: '40%', height: 8, borderRadius: config.radii.R300, backgroundColor: 'rgba(255,255,255,0.1)' }} />
              <Box
                style={{
                  width: '80%',
                  height: 20,
                  marginTop: 'auto',
                  borderRadius: config.radii.R300,
                  border: `1px solid ${localColor}`,
                  backgroundColor: `${localColor}11`,
                  transition: 'all 0.2s ease',
                }}
              />
            </Box>
          </Box>

          {/* Mini Modals Preview */}
          <Box
            direction="Row"
            gap="100"
            alignItems="Center"
            style={{
              marginTop: config.space.S300,
              padding: `${config.space.S100} 0`,
            }}
          >
            <Box
              style={{
                width: 60,
                height: 30,
                borderRadius: config.radii.R300,
                backdropFilter: applyModals ? `blur(${localBlur}px)` : 'none',
                backgroundColor: applyModals ? `rgba(20, 20, 30, ${localOpacity})` : 'var(--sable-surface-container-active)',
                border: `1px solid ${localColor}66`,
                transition: 'all 0.2s ease',
              }}
            />
            <Text size="T200" style={{ opacity: 0.6 }}>
              Modal
            </Text>
          </Box>
        </SequenceCard>

        {/* Enable / disable toggle */}
        <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
          <SettingTile
            title="Enable Neon Glass Overlay"
            focusId="neon-glass-enabled"
            description="Activates real-time glassmorphism that overlays your currently applied theme."
            after={<Switch variant="Primary" value={enabled ?? false} onChange={(v) => setEnabled(v)} />}
          />
        </SequenceCard>
      </Box>

      {enabled && (
        <>
          {/* Colors Section */}
          <Box direction="Column" gap="100">
            <Text size="L400">Neon Colors</Text>
            <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column" gap="400">
              <SettingTile
                title="Neon Accent Color"
                focusId="neon-accent-color"
                description="Choose the custom glow and accent color for the Neon Glass effect."
                after={
                  <Box direction="Row" alignItems="Center" gap="100">
                    <HexColorPickerPopOut
                      picker={<HexColorPicker color={localColor} onChange={handleColorUpdate} />}
                    >
                      {(onOpen, opened) => (
                        <Button
                          onClick={onOpen}
                          size="400"
                          variant="Secondary"
                          fill="None"
                          radii="300"
                          style={{
                            padding: config.space.S100,
                            border: `2px solid ${opened ? 'var(--sable-primary-main)' : 'var(--sable-surface-container-line)'}`,
                          }}
                        >
                          <Box
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              backgroundColor: localColor,
                              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)',
                            }}
                          />
                        </Button>
                      )}
                    </HexColorPickerPopOut>
                    <Input
                      value={localColor}
                      onChange={(e) => handleColorUpdate(e.currentTarget.value)}
                      placeholder="#FFFFFF"
                      variant="Background"
                      size="300"
                      radii="300"
                      style={{
                        textTransform: 'uppercase',
                        fontFamily: 'monospace',
                        width: '100px',
                      }}
                    />
                    <IconButton
                      variant="Secondary"
                      size="300"
                      radii="300"
                      onClick={() => handleColorUpdate(NEON_GLASS_DEFAULTS.primaryColor)}
                      title="Reset color"
                    >
                      <Icon src={Icons.Cross} size="100" />
                    </IconButton>
                  </Box>
                }
              />
              <SettingTile
                title="Color Presets"
                description="Quick access to popular neon colors."
                after={
                  <Box direction="Row" gap="100" alignItems="Center">
                    {COLOR_PRESETS.map((preset) => (
                      <Box
                        key={preset.color}
                        onClick={() => handlePresetColor(preset.color)}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: config.radii.R300,
                          backgroundColor: preset.color,
                          cursor: 'pointer',
                          border: localColor.toUpperCase() === preset.color.toUpperCase() ? `2px solid white` : '1px solid var(--sable-surface-container-line)',
                          boxShadow:
                            localColor.toUpperCase() === preset.color.toUpperCase()
                              ? `0 0 8px ${preset.color}, inset 0 0 4px rgba(255,255,255,0.3)`
                              : 'none',
                          transition: 'all 0.2s ease',
                        }}
                        title={preset.name}
                        role="button"
                        aria-label={`Select ${preset.name} color`}
                      />
                    ))}
                  </Box>
                }
              />
            </SequenceCard>
          </Box>

          {/* Effects Section */}
          <Box direction="Column" gap="100">
            <Text size="L400">Effect Intensity</Text>
            <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column" gap="400">
              <SettingTile
                title={`Glass Blur: ${localBlur}px`}
                description="How strongly the sidebar and dialogs blur the content behind them."
                after={renderSlider(localBlur, 0, 32, 1, (v) => {
                  setLocalBlur(v);
                  debounceSaveBlur(v);
                }, 'Blur radius slider')}
              />
              <SettingTile
                title={`Sidebar & Modals Background: ${Math.round(localOpacity * 100)}%`}
                description="Transparency level of the sidebar and popup panels."
                after={renderSlider(localOpacity, 0.05, 1.0, 0.05, (v) => {
                  setLocalOpacity(v);
                  debounceSaveOpacity(v);
                }, 'Background opacity slider')}
              />
              <SettingTile
                title={`Chat Background: ${Math.round(localChatOpacity * 100)}%`}
                description="Transparency level of the main chat area so neon doesn't overpower the messages."
                after={renderSlider(localChatOpacity, 0.0, 1.0, 0.05, (v) => {
                  setLocalChatOpacity(v);
                  debounceSaveChatOpacity(v);
                }, 'Chat opacity slider')}
              />
              <SettingTile
                title={`Glow Intensity: ${localGlow}px`}
                description="How strong the neon glow effect is on buttons and active items."
                after={renderSlider(localGlow, 0, 30, 1, (v) => {
                  setLocalGlow(v);
                  debounceSaveGlow(v);
                }, 'Glow intensity slider')}
              />
              <SettingTile
                title={`Bubble Glow: ${localBubbleGlow}px`}
                description="Glow effect intensity specifically for chat bubbles. Set to 0 to disable."
                after={renderSlider(localBubbleGlow, 0, 20, 1, (v) => {
                  setLocalBubbleGlow(v);
                  debounceSaveBubbleGlow(v);
                }, 'Bubble glow slider')}
              />
            </SequenceCard>

            {/* Performance warning */}
            {isSlow && (
              <Box
                style={{
                  padding: config.space.S200,
                  borderRadius: config.radii.R300,
                  backgroundColor: 'var(--sable-warn-container)',
                  border: '1px solid var(--sable-warn-container-line)',
                  marginTop: config.space.S100,
                }}
              >
                <Text size="T200" style={{ color: 'var(--sable-warn-on-container)' }}>
                  ⚠️ High values may impact performance on lower-end devices
                </Text>
              </Box>
            )}
          </Box>

          {/* Granular Toggles Section */}
          <Box direction="Column" gap="100">
            <Text size="L400">Apply Effects To</Text>
            <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column" gap="400">
              <SettingTile
                title="Sidebar & Navigation"
                description="Apply glass effect to the main sidebar and room lists."
                after={<Switch variant="Primary" value={applySidebar} onChange={setApplySidebar} />}
              />
              <SettingTile
                title="Chat & Main Content"
                description="Apply glass effect to the timeline and message area."
                after={<Switch variant="Primary" value={applyChat} onChange={setApplyChat} />}
              />
              <SettingTile
                title="Targeted & Replied Messages"
                description="Apply neon glow to the message you are currently replying to."
                after={<Switch variant="Primary" value={applyReply} onChange={setApplyReply} />}
              />
              <SettingTile
                title="Modals & Menus"
                description="Apply glass effect to dialogs, popouts and context menus."
                after={<Switch variant="Primary" value={applyModals} onChange={setApplyModals} />}
              />
            </SequenceCard>
          </Box>

          {/* Action Buttons */}
          <Box direction="Row" gap="200" style={{ marginTop: config.space.S200 }}>
            <Button
              variant="Secondary"
              fill="Soft"
              size="300"
              onClick={handleResetToDefaults}
              style={{ flex: 1 }}
            >
              <Text size="B300">Reset</Text>
            </Button>
            <Button
              variant="Secondary"
              fill="Soft"
              size="300"
              onClick={handleImportTheme}
              style={{ flex: 1 }}
            >
              <Text size="B300">Import</Text>
            </Button>
            <Button
              variant="Secondary"
              fill="Soft"
              size="300"
              onClick={handleExportTheme}
              style={{ flex: 1 }}
            >
              <Text size="B300">Export Theme</Text>
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}
