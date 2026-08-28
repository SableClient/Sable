import { atom } from 'jotai';

export enum RoomSettingsPage {
  GeneralPage,
  MembersPage,
  PermissionsPage,
  EmojisStickersPage,
  DeveloperToolsPage,
  // Sable pages
  CosmeticsPage,
  AbbreviationsPage,
  /** Spaces only. */
  AppearancePage,
}

export type RoomSettingsState = {
  page?: RoomSettingsPage;
  roomId: string;
  spaceId?: string;
  /** True when opened via the chat-level leftward swipe (mobile fullscreen). */
  openedViaSwipe?: boolean;
};

export const roomSettingsAtom = atom<RoomSettingsState | undefined>(undefined);
