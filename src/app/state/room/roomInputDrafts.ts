import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { Descendant } from 'slate';
import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import type { IEventRelation } from '$types/matrix-sdk';
import type { TUploadContent } from '$utils/matrix';
import { createUploadAtomFamily } from '$state/upload';
import { createListAtom } from '$state/list';
import { createEmbedAtomFamily } from '$state/bundle.ts';

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

export type TEmbeddItem = {
  url: string;
};

type TEmbeddListAtom = ReturnType<typeof createListAtom<TEmbeddItem>>;

export const roomIdToEmbeddItemsAtomFamily = atomFamily<string, TEmbeddListAtom>(createListAtom);
export const roomEmbedAtomFamily = createEmbedAtomFamily();

const createMsgDraftAtom = () => atom<Descendant[]>([]);
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
