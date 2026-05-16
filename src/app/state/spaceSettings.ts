import { atom } from 'jotai';

export enum SpaceSettingsPage {
  GeneralPage,
  MembersPage,
  PermissionsPage,
  EmojisStickersPage,
  DeveloperToolsPage,
  // Sable pages
  CosmeticsPage,
  AbbreviationsPage,
  AppearancePage,
}

export type SpaceSettingsState = {
  page?: SpaceSettingsPage;
  roomId: string;
  spaceId?: string;
};

export const spaceSettingsAtom = atom<SpaceSettingsState | undefined>(undefined);
