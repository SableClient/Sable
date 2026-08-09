import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';

import { SettingMenuSelector } from '$components/setting-menu-selector';
import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { isAndroidTauri, isMobileTauri } from '$utils/platform';
import defaultIcon from './app-icons/default.png';
import propelerIcon from './app-icons/propeler.png';

const PRIMARY_ICON = 'primary';
const APP_ICON_PREVIEWS: Record<string, string> = {
  [PRIMARY_ICON]: defaultIcon,
  propeler: propelerIcon,
};

function AppIconPreview({ icon }: { icon: string }) {
  const src = APP_ICON_PREVIEWS[icon];
  if (!src) return null;

  return (
    <img
      src={src}
      alt=""
      aria-hidden
      data-testid={`app-icon-preview-${icon}`}
      width={48}
      height={48}
      style={{ borderRadius: isAndroidTauri() ? '50%' : '22.5%' }}
    />
  );
}

export function AppIconRuntimeFeature() {
  const [appIconId] = useSetting(settingsAtom, 'appIconId');

  useEffect(() => {
    if (!isMobileTauri()) return;

    let cancelled = false;
    Promise.all([
      invoke<string[]>('plugin:app-icon|get_available_icons'),
      invoke<string | null>('plugin:app-icon|get_current_icon'),
    ])
      .then(async ([icons, current]) => {
        const icon = icons.includes(appIconId ?? '') ? appIconId! : null;
        if (!cancelled && current !== icon) {
          await invoke('plugin:app-icon|set_icon', { request: { icon } });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [appIconId]);

  return null;
}

export function AppIconSettings() {
  const [appIconId, setAppIconId] = useSetting(settingsAtom, 'appIconId');
  const [icons, setIcons] = useState<string[]>();
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    if (!isMobileTauri()) return;

    let cancelled = false;
    invoke<string[]>('plugin:app-icon|get_available_icons')
      .then((availableIcons) => {
        if (!cancelled) setIcons(availableIcons);
      })
      .catch(() => {
        if (!cancelled) setIcons([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!icons?.length) return null;

  const options = [
    { value: PRIMARY_ICON, label: 'Default', icon: <AppIconPreview icon={PRIMARY_ICON} /> },
    ...icons.map((icon) => ({
      value: icon,
      label: icon === 'propeler' ? 'Propeler' : icon,
      icon: <AppIconPreview icon={icon} />,
    })),
  ];
  const selectedIcon = icons.includes(appIconId ?? '') ? appIconId! : PRIMARY_ICON;

  const selectIcon = async (icon: string) => {
    if (changing || icon === selectedIcon) return;

    setChanging(true);
    try {
      await invoke('plugin:app-icon|set_icon', {
        request: { icon: icon === PRIMARY_ICON ? null : icon },
      });
      setAppIconId(icon === PRIMARY_ICON ? undefined : icon);
    } finally {
      setChanging(false);
    }
  };

  return (
    <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
      <SettingTile
        title="App Icon"
        description="Choose the icon shown on your device's home screen."
        focusId="app-icon"
        after={
          <SettingMenuSelector
            value={selectedIcon}
            options={options}
            onSelect={selectIcon}
            loading={changing}
            optionStyle={{ height: 'auto', minHeight: 64, padding: '8px 12px' }}
          />
        }
      />
    </SequenceCard>
  );
}
