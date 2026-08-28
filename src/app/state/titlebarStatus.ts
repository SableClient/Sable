import { atom } from 'jotai';

export type TitlebarStatusVariant = 'Success' | 'Warning' | 'Critical' | 'Primary';
export type TitlebarStatusView = {
  text: string;
  variant: TitlebarStatusVariant;
  progress?: number;
};

export const titlebarStatusAtom = atom<TitlebarStatusView | null>(null);
