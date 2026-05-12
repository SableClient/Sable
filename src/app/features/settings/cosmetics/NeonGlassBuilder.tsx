import { useEffect, useCallback, useId, useState } from 'react';
import { Box, Switch, Text, Line, config, Button } from 'folds';
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
 *
 * Architecture:
 *  - State persisted via existing Sable jotai settingsAtom (localStorage-backed)
 *  - DOM mutation (CSS vars) delegated to ThemeEngine service (Clean Architecture)
 *  - Slider updates debounced at 50 ms to prevent layout thrashing
 *  - All changes optimized with smooth transitions and sensible defaults
 */
export function NeonGlassBuilder() {
  const [enabled, setEnabled] = useSetting(settingsAtom, 'neonGlassEnabled');
  const [primaryColor, setPrimaryColor] = useSetting(settingsAtom, 'neonGlassPrimaryColor');
  const [blurRadius, setBlurRadius] = useSetting(settingsAtom, 'neonGlassBlur');
  const [bgOpacity, setBgOpacity] = useSetting(settingsAtom, 'neonGlassBgOpacity');
  const [glowRadius, setGlowRadius] = useSetting(settingsAtom, 'neonGlassGlow');

  const [applySidebar, setApplySidebar] = useSetting(settingsAtom, 'neonGlassApplySidebar');
  const [applyChat, setApplyChat] = useSetting(settingsAtom, 'neonGlassApplyChat');
  const [applyModals, setApplyModals] = useSetting(settingsAtom, 'neonGlassApplyModals');

  // Local slider state for immediate UI feedback; debounced before hitting ThemeEngine
  const [localBlur, setLocalBlur] = useState(blurRadius ?? NEON_GLASS_DEFAULTS.blurRadius);
  const [localOpacity, setLocalOpacity] = useState(bgOpacity ?? NEON_GLASS_DEFAULTS.bgOpacity);
  const [localColor, setLocalColor] = useState(primaryColor ?? NEON_GLASS_DEFAULTS.primaryColor);
  const [localGlow, setLocalGlow] = useState(glowRadius ?? NEON_GLASS_DEFAULTS.glowRadius);
  const [colorError, setColorError] = useState(false);

  // Sable's useDebounce is callback-based; wrap to debounce the save
  const debounceSaveBlur = useDebounce(
    useCallback((v: number) => setBlurRadius(v), [setBlurRadius]),
    { wait: 50 }
  );
  const debounceSaveOpacity = useDebounce(
    useCallback((v: number) => setBgOpacity(v), [setBgOpacity]),
    { wait: 50 }
  );
  const debounceSaveColor = useDebounce(
    useCallback((v: string) => setPrimaryColor(v), [setPrimaryColor]),
    { wait: 50 }
  );
  const debounceSaveGlow = useDebounce(
    useCallback((v: number) => setGlowRadius(v), [setGlowRadius]),
    { wait: 50 }
  );

  // Validate hex color format
  const isValidColor = (color: string): boolean => {
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
  };

  // Check if values are extreme (performance warning)
  const isSlow = localBlur > 20 || localGlow > 20;

  // Apply / reset CSS variables whenever relevant state changes
  useEffect(() => {
    if (!enabled) {
      ThemeEngine.resetNeonGlass();
      return;
    }
    ThemeEngine.applyNeonGlass({
      primaryColor: localColor,
      blurRadius: localBlur,
      bgOpacity: localOpacity,
      glowRadius: localGlow,
      applySidebar,
      applyChat,
      applyModals,
      enableTransition: true,
    });
  }, [enabled, localColor, localBlur, localOpacity, localGlow, applySidebar, applyChat, applyModals]);

  const colorId = useId();
  const blurId = useId();
  const opacityId = useId();
  const glowId = useId();

  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setLocalColor(v);
      setColorError(!isValidColor(v));
      debounceSaveColor(v);
    },
    [debounceSaveColor]
  );

  const handleBlurChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      setLocalBlur(v);
      debounceSaveBlur(v);
    },
    [debounceSaveBlur]
  );

  const handleOpacityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      setLocalOpacity(v);
      debounceSaveOpacity(v);
    },
    [debounceSaveOpacity]
  );

  const handleGlowChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      setLocalGlow(v);
      debounceSaveGlow(v);
    },
    [debounceSaveGlow]
  );

  // Reset all to defaults
  const handleResetToDefaults = useCallback(() => {
    setLocalColor(NEON_GLASS_DEFAULTS.primaryColor);
    setLocalBlur(NEON_GLASS_DEFAULTS.blurRadius);
    setLocalOpacity(NEON_GLASS_DEFAULTS.bgOpacity);
    setLocalGlow(NEON_GLASS_DEFAULTS.glowRadius);
    setColorError(false);

    setPrimaryColor(NEON_GLASS_DEFAULTS.primaryColor);
    setBlurRadius(NEON_GLASS_DEFAULTS.blurRadius);
    setBgOpacity(NEON_GLASS_DEFAULTS.bgOpacity);
    setGlowRadius(NEON_GLASS_DEFAULTS.glowRadius);
  }, [setPrimaryColor, setBlurRadius, setBgOpacity, setGlowRadius]);

  // Apply a preset color
  const handlePresetColor = useCallback(
    (color: string) => {
      setLocalColor(color);
      setColorError(false);
      debounceSaveColor(color);
    },
    [debounceSaveColor]
  );

  // Export theme as JSON
  const handleExportTheme = useCallback(() => {
    const theme: NeonGlassPrefs = {
      primaryColor: localColor,
      blurRadius: localBlur,
      bgOpacity: localOpacity,
      glowRadius: localGlow,
      applySidebar,
      applyChat,
      applyModals,
    };

    const json = JSON.stringify(theme, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neon-glass-theme-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [localColor, localBlur, localOpacity, localGlow, applySidebar, applyChat, applyModals]);

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">✨ Neon Glass Builder</Text>

      {/* Live Preview Section */}
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        style={{
          padding: config.space.S300,
          background: '#0d0d17',
          backgroundImage: `radial-gradient(circle at 0% 0%, ${localColor}22 0%, transparent 50%)`,
          overflow: 'hidden',
          border: `1px solid ${localColor}44`,
          borderRadius: 12,
        }}
      >
        <Text size="T200" style={{ marginBottom: config.space.S200, opacity: 0.7 }}>
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
              borderRadius: 8,
              backdropFilter: applySidebar ? `blur(${localBlur}px)` : 'none',
              backgroundColor: applySidebar ? `rgba(20, 20, 30, ${localOpacity})` : 'rgba(20, 20, 30, 0.8)',
              border: applySidebar ? '1px solid rgba(255,255,255,0.1)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <Box
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                backgroundColor: localColor,
                boxShadow: `0 0 ${localGlow}px ${localColor}`,
                transition: 'all 0.2s ease',
              }}
            />
            <Box style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.05)' }} />
            <Box style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.05)' }} />
          </Box>

          {/* Mini Chat */}
          <Box
            grow="Yes"
            direction="Column"
            gap="100"
            style={{
              padding: config.space.S200,
              borderRadius: 8,
              backdropFilter: applyChat ? `blur(${localBlur}px)` : 'none',
              backgroundColor: applyChat ? `rgba(20, 20, 30, ${localOpacity})` : 'rgba(20, 20, 30, 0.8)',
              border: applyChat ? '1px solid rgba(255,255,255,0.1)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <Box style={{ width: '60%', height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)' }} />
            <Box style={{ width: '40%', height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)' }} />
            <Box
              style={{
                width: '80%',
                height: 20,
                marginTop: 'auto',
                borderRadius: 4,
                border: `1px solid ${localColor}88`,
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
              borderRadius: 6,
              backdropFilter: applyModals ? `blur(${localBlur}px)` : 'none',
              backgroundColor: applyModals ? `rgba(20, 20, 30, ${localOpacity})` : 'rgba(20, 20, 30, 0.8)',
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
          title="Enable Neon Glass Theme"
          focusId="neon-glass-enabled"
          description="Activates real-time glassmorphism & neon accent customisation with smooth transitions."
          after={<Switch variant="Primary" value={enabled ?? false} onChange={(v) => setEnabled(v)} />}
        />
      </SequenceCard>

      {enabled && (
        <>
          {/* Neon accent colour with presets */}
          <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
            <SettingTile
              title="Neon Accent Color"
              focusId={colorId}
              description="The primary glow and button colour for the Neon Glass theme."
              after={
                <Box direction="Row" alignItems="Center" gap="200">
                  <input
                    id={colorId}
                    type="color"
                    value={localColor}
                    onChange={handleColorChange}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      border: colorError ? '2px solid #ff006e' : 'none',
                      cursor: 'pointer',
                      background: 'none',
                      padding: 0,
                      transition: 'border 0.2s ease',
                    }}
                    aria-label="Neon accent color picker"
                  />
                  <Text size="T200" style={{ fontFamily: 'monospace', opacity: colorError ? 0.5 : 1 }}>
                    {localColor.toUpperCase()}
                  </Text>
                </Box>
              }
            />
          </SequenceCard>

          {/* Color Presets */}
          <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
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
                        borderRadius: 6,
                        backgroundColor: preset.color,
                        cursor: 'pointer',
                        border: localColor === preset.color ? `2px solid white` : '1px solid rgba(255,255,255,0.2)',
                        boxShadow:
                          localColor === preset.color
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

          {/* Blur radius */}
          <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
            <SettingTile
              title={`Glass Blur: ${localBlur}px`}
              focusId={blurId}
              description="How strongly the sidebar and dialogs blur the content behind them."
              after={
                <input
                  id={blurId}
                  type="range"
                  min={0}
                  max={32}
                  step={1}
                  value={localBlur}
                  onChange={handleBlurChange}
                  style={{ width: 120, accentColor: localColor }}
                  aria-label="Blur radius slider"
                />
              }
            />
          </SequenceCard>

          {/* Background opacity */}
          <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
            <SettingTile
              title={`Background Opacity: ${Math.round(localOpacity * 100)}%`}
              focusId={opacityId}
              description="Transparency level of the glass panels. Lower = more transparent."
              after={
                <input
                  id={opacityId}
                  type="range"
                  min={0.05}
                  max={1.0}
                  step={0.05}
                  value={localOpacity}
                  onChange={handleOpacityChange}
                  style={{ width: 120, accentColor: localColor }}
                  aria-label="Background opacity slider"
                />
              }
            />
          </SequenceCard>

          {/* Glow intensity */}
          <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
            <SettingTile
              title={`Glow Intensity: ${localGlow}px`}
              focusId={glowId}
              description="How strong the neon glow effect is on buttons and active items."
              after={
                <input
                  id={glowId}
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={localGlow}
                  onChange={handleGlowChange}
                  style={{ width: 120, accentColor: localColor }}
                  aria-label="Glow intensity slider"
                />
              }
            />
          </SequenceCard>

          {/* Performance warning */}
          {isSlow && (
            <Box
              style={{
                padding: config.space.S200,
                borderRadius: 8,
                backgroundColor: 'rgba(227, 186, 145, 0.1)',
                border: '1px solid rgba(227, 186, 145, 0.3)',
              }}
            >
              <Text size="T200" style={{ color: '#e3ba91' }}>
                ⚠️ High values may impact performance on lower-end devices
              </Text>
            </Box>
          )}

          <Text size="L400" style={{ marginTop: config.space.S200, opacity: 0.6 }}>
            Apply effects to:
          </Text>

          {/* Granular Toggles */}
          <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
            <SettingTile
              title="Sidebar & Navigation"
              description="Apply glass effect to the main sidebar and room lists."
              after={<Switch variant="Primary" value={applySidebar} onChange={setApplySidebar} />}
            />
            <Line variant="Surface" size="300" />
            <SettingTile
              title="Chat & Main Content"
              description="Apply glass effect to the timeline and message area."
              after={<Switch variant="Primary" value={applyChat} onChange={setApplyChat} />}
            />
            <Line variant="Surface" size="300" />
            <SettingTile
              title="Modals & Menus"
              description="Apply glass effect to dialogs, popouts and context menus."
              after={<Switch variant="Primary" value={applyModals} onChange={setApplyModals} />}
            />
          </SequenceCard>

          {/* Action Buttons */}
          <Box direction="Row" gap="200">
            <Button
              onClick={handleResetToDefaults}
              style={{
                flex: 1,
                padding: `${config.space.S200} ${config.space.S300}`,
              }}
            >
              Reset to Defaults
            </Button>
            <Button
              onClick={handleExportTheme}
              style={{
                flex: 1,
                padding: `${config.space.S200} ${config.space.S300}`,
              }}
            >
              Export Theme
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}
