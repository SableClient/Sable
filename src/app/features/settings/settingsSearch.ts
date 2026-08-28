import { settingsSections, type SettingsSectionId } from './routes';
import { humanizeSettingsLinkPart, settingsLinkFocusIdsBySection } from './settingsLink';

export type SettingsSearchEntry = {
  section: SettingsSectionId;
  focusId: string;
  label: string;
  sectionLabel: string;
};

const settingsSectionLabel = Object.fromEntries(
  settingsSections.map((section) => [section.id, section.label])
) as Record<SettingsSectionId, string>;

const searchIndex: SettingsSearchEntry[] = settingsSections.flatMap((section) =>
  settingsLinkFocusIdsBySection[section.id].map((focusId) => ({
    section: section.id,
    focusId,
    label: humanizeSettingsLinkPart(focusId),
    sectionLabel: settingsSectionLabel[section.id],
  }))
);

export const searchSettings = (query: string): SettingsSearchEntry[] => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return searchIndex.filter(
    (entry) => entry.label.toLowerCase().includes(q) || entry.sectionLabel.toLowerCase().includes(q)
  );
};
