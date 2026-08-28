import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { EditorDocument } from '$components/editor/model';
import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import type { IEventRelation } from '$types/matrix-sdk';
import type { TUploadContent } from '$utils/matrix';
import { createUploadAtomFamily } from '$state/upload';
import { createListAtom } from '$state/list';

export type TUploadMetadata = {
  markedAsSpoiler: boolean;
  waveform?: number[];
  audioDuration?: number;
};

export type TUploadItem = {
  file: TUploadContent;
  originalFile: TUploadContent;
  metadata: TUploadMetadata;
  encInfo: EncryptedAttachmentInfo | undefined;
  encrypting?: boolean;
  body?: string;
  format?: string;
  formatted_body?: string;
};

type TUploadListAtom = ReturnType<typeof createListAtom<TUploadItem>>;

export const roomIdToUploadItemsAtomFamily = atomFamily<string, TUploadListAtom>(createListAtom);

export const roomUploadAtomFamily = createUploadAtomFamily();

// Room drafts are Sable documents, not a rendering-engine data structure.
const createMsgDraftAtom = () => atom<EditorDocument>([]);
type TMsgDraftAtom = ReturnType<typeof createMsgDraftAtom>;
export const roomIdToMsgDraftAtomFamily = atomFamily<string, TMsgDraftAtom>(() =>
  createMsgDraftAtom()
);

export type IReplyDraft = {
  userId: string;
  eventId: string;
  body: string;
  formattedBody?: string | undefined;
  relation?: IEventRelation | undefined;
};
const createReplyDraftAtom = () => atom<IReplyDraft | undefined>(undefined);
type TReplyDraftAtom = ReturnType<typeof createReplyDraftAtom>;
export const roomIdToReplyDraftAtomFamily = atomFamily<string, TReplyDraftAtom>(() =>
  createReplyDraftAtom()
);
