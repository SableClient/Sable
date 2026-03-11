import { atom } from 'jotai';
import { MatrixEvent, Room, Relations } from '$types/matrix-sdk';

export enum ModalType {
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
  | { type: ModalType.Delete; room: Room; mEvent: MatrixEvent }
  | { type: ModalType.Forward; room: Room; mEvent: MatrixEvent }
  | { type: ModalType.Report; room: Room; mEvent: MatrixEvent }
  | { type: ModalType.Source; room: Room; mEvent: MatrixEvent }
  | { type: ModalType.EditHistory; room: Room; mEvent: MatrixEvent }
  | { type: ModalType.Reactions; room: Room; relations: Relations }
  | { type: ModalType.ReadReceipts; room: Room; eventId: string }
  | null;

export const modalAtom = atom<ModalState>(null);
