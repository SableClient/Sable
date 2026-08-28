import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';

import { SettingMenuSelector } from '$components/setting-menu-selector';
import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { isAndroidTauri, isMobileTauri } from '$utils/platform';
import defaultIcon from './app-icons/default.png';
import agenderIcon from '../../../../../src-tauri/icons/app-icons/agender.svg';
import bisexualIcon from '../../../../../src-tauri/icons/app-icons/bisexual.svg';
import transGradientIcon from '../../../../../src-tauri/icons/app-icons/trans-gradient.svg';
import intersexIcon from '../../../../../src-tauri/icons/app-icons/intersex.svg';
import lesbianIcon from '../../../../../src-tauri/icons/app-icons/lesbian.svg';
import mlmIcon from '../../../../../src-tauri/icons/app-icons/mlm.svg';
import propellerIcon from './app-icons/propeller.png';
import prideIcon from '../../../../../src-tauri/icons/app-icons/pride.svg';
import transIcon from './app-icons/trans.png';

const PRIMARY_ICON = 'primary';
const PROPELLER_ICON = 'propeller';
const APP_ICON_PREVIEWS: Record<string, string> = {
  [PRIMARY_ICON]: defaultIcon,
  [PROPELLER_ICON]: propellerIcon,
  agender: agenderIcon,
  bisexual: bisexualIcon,
  trans: transIcon,
  transgradient: transGradientIcon,
  intersex: intersexIcon,
  lesbian: lesbianIcon,
  mlm: mlmIcon,
  pride: prideIcon,
};
const APP_ICON_LABELS: Record<string, string> = {
  agender: 'Agender',
  bisexual: 'Bisexual',
  trans: 'Trans',
  transgradient: 'Trans (Gradient)',
  intersex: 'Intersex',
  lesbian: 'Lesbian',
  mlm: 'MLM',
  pride: 'Pride',
  [PROPELLER_ICON]: 'Propeller',
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

export function AppIconSettings() {
  const [appIconId, setAppIconId] = useState<string>();
  const [icons, setIcons] = useState<string[]>();
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    if (!isMobileTauri()) return;

    let cancelled = false;
    Promise.all([
      invoke<string[]>('plugin:app-icon|get_available_icons'),
      invoke<string | null>('plugin:app-icon|get_current_icon'),
    ])
      .then(([availableIcons, currentIcon]) => {
        if (cancelled) return;
        setIcons(availableIcons);
        setAppIconId(currentIcon && availableIcons.includes(currentIcon) ? currentIcon : undefined);
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
      label: APP_ICON_LABELS[icon] ?? icon,
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
