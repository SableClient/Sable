import { useEffect } from 'react';
import { isDesktopTauri } from '$utils/platform';
import { useDesktopSetting } from '$state/hooks/desktopSettings';

// Editable fields inherit their spellcheck state from <body>, so a single
// attribute governs the composer and every text input.
export function DesktopSpellcheck() {
  const [spellcheck] = useDesktopSetting('spellcheck');

  useEffect(() => {
    if (!isDesktopTauri()) return;
    document.body.spellcheck = spellcheck;
  }, [spellcheck]);

  return null;
}
