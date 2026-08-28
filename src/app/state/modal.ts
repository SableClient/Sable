import { atom } from 'jotai';
import type { MatrixEvent, Room, Relations } from '$types/matrix-sdk';
import type { OptionMenuProps } from '$components/message/modals/Options';

export enum ModalType {
  MobileOptions = 'mobile_options',
  ReactionPicker = 'reaction_picker',
  ReproxyPicker = 'reproxy_picker',
  Delete = 'delete',
  // for forwarding a message to another room, not to be confused with the "share" action which is for sharing a message to another app
  Forward = 'forward',
  Report = 'report',
  Source = 'source',
  Reactions = 'reactions',
  EditHistory = 'edit_history',
  ReadReceipts = 'read_receipts',
}

export type ModalState =
  | { type: ModalType.MobileOptions; options: OptionMenuProps }
  | {
      type: ModalType.ReactionPicker;
      mEvent: MatrixEvent;
      imagePackRooms?: Room[];
      onReactionToggle?: (targetEventId: string, key: string, shortcode?: string) => void;
      closeMenu: () => void;
    }
  | { type: ModalType.ReproxyPicker; room: Room; mEvent: MatrixEvent; closeMenu: () => void }
  | { type: ModalType.Delete; room: Room; mEvent: MatrixEvent }
  | { type: ModalType.Forward; room: Room; mEvent: MatrixEvent }
  | { type: ModalType.Report; room: Room; mEvent: MatrixEvent }
  | { type: ModalType.Source; room: Room; mEvent: MatrixEvent }
  | { type: ModalType.EditHistory; room: Room; mEvent: MatrixEvent }
  | { type: ModalType.Reactions; room: Room; relations: Relations }
  | { type: ModalType.ReadReceipts; room: Room; eventId: string }
  | null;

const modalStackAtom = atom<NonNullable<ModalState>[]>([]);

export const modalAtom = atom(
  (get) => get(modalStackAtom).at(-1) ?? null,
  (_get, set, next: ModalState) => {
    set(modalStackAtom, next ? [next] : []);
  }
);

export const pushModalAtom = atom(null, (get, set, next: NonNullable<ModalState>) => {
  set(modalStackAtom, [...get(modalStackAtom), next]);
});

export const popModalAtom = atom(null, (get, set) => {
  set(modalStackAtom, get(modalStackAtom).slice(0, -1));
});
