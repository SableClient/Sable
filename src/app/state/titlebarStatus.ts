import { atom } from 'jotai';

export type TitlebarStatusVariant = 'Success' | 'Warning' | 'Critical';
export type TitlebarStatusView = {
  text: string;
  variant: TitlebarStatusVariant;
};

export const titlebarStatusAtom = atom<TitlebarStatusView | null>(null);
