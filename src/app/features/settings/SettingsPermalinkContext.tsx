import { createContext, useContext } from 'react';
import { type SettingsSectionId } from './routes';

type SettingsPermalinkContextValue = {
  section: SettingsSectionId;
  baseUrl: string;
};

const SettingsPermalinkContext = createContext<SettingsPermalinkContextValue | null>(null);

export const SettingsPermalinkProvider = SettingsPermalinkContext.Provider;

export const useSettingsPermalinkContext = (): SettingsPermalinkContextValue | null =>
  useContext(SettingsPermalinkContext);

export type { SettingsPermalinkContextValue };
