import { createContext, useContext } from 'react';
import { type SettingsSectionId } from './routes';

type SettingsLinkContextValue = {
  section: SettingsSectionId;
  baseUrl: string;
};

const SettingsLinkContext = createContext<SettingsLinkContextValue | null>(null);

export const SettingsLinkProvider = SettingsLinkContext.Provider;

export const useSettingsLinkContext = (): SettingsLinkContextValue | null =>
  useContext(SettingsLinkContext);

export type { SettingsLinkContextValue };
