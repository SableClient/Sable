import type {
  KeyboardEventHandler,
  MouseEvent,
  PointerEvent,
  ReactElement,
  RefObject,
} from 'react';
import {
  forwardRef,
  Fragment,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';

import { isKeyHotkey } from 'is-hotkey';
import type {
  IContent,
  MatrixEvent,
  Room,
  IEventRelation,
  RoomMessageEventContent,
  StickerEventContent,
  TimelineEvents,
} from '$types/matrix-sdk';
import { MatrixError } from '$types/matrix-sdk';
import { EventType, RelationType } from '$types/matrix-sdk';
import { M_POLL_START } from 'matrix-js-sdk';
import type { RectCords } from 'folds';
import {
  Box,
  color,
  config,
  Dialog,
  IconButton,
  Menu,
  MenuItem,
  OverlayBackdrop,
  OverlayCenter,
  Scroll,
  Spinner,
  Text,
  toRem,
} from 'folds';
import { Overlay, PopOut } from '$components/overlay-stack';

import { useMatrixClient } from '$hooks/useMatrixClient';
import type { ProseMirrorEditorController } from '$components/editor/prosemirrorController';
import {
  AutocompletePrefix,
  useAutocompleteQuery,
  createEmoticonElement,
  CustomEditor,
  customHtmlEqualsPlainText,
  RoomMentionAutocomplete,
  toMatrixCustomHTML,
  toPlainText,
  trimCustomHtml,
  UserMentionAutocomplete,
  EmoticonAutocomplete,
  ANYWHERE_AUTOCOMPLETE_PREFIXES,
  BEGINNING_AUTOCOMPLETE_PREFIXES,
  MarkdownFormattingToolbarBottom,
  MarkdownFormattingToolbarToggle,
  markEventConsumedByHost,
} from '$components/editor';
import { stripMarkdownEscapesForHiddenPreviews } from './message/hiddenLinkPreviews';
import { plainToEditorInput } from '$components/editor/input';
import type { EditorDocument } from '$components/editor/model';
import type { GifData } from '$components/emoji-board';
import { EmojiBoard, EmojiBoardTab } from '$components/emoji-board';
import { UseStateProvider } from '$components/UseStateProvider';
import type { TUploadContent } from '$utils/matrix';
import {
  cancelUploadContent,
  encryptFile,
  getImageInfo,
  mxcUrlToHttp,
  toggleReaction,
} from '$utils/matrix';
import { useTypingStatusUpdater } from '$hooks/useTypingStatusUpdater';
import { useFilePicker } from '$hooks/useFilePicker';
import { useFilePasteHandler } from '$hooks/useFilePasteHandler';
import { useFileDropZone } from '$hooks/useFileDrop';
import type { TUploadItem, TUploadMetadata, IReplyDraft } from '$state/room/roomInputDrafts';
import {
  roomIdToMsgDraftAtomFamily,
  roomIdToReplyDraftAtomFamily,
  roomIdToUploadItemsAtomFamily,
  roomUploadAtomFamily,
} from '$state/room/roomInputDrafts';
import { UploadCardRenderer } from '$components/upload-card';
import type { UploadBoardImperativeHandlers } from '$components/upload-board';
import { UploadBoard, UploadBoardContent, UploadBoardHeader } from '$components/upload-board';
import type { Upload, UploadSuccess } from '$state/upload';
import { UploadStatus, createUploadFamilyObserverAtom } from '$state/upload';
import { loadImageElementFromMediaUrl } from '$utils/dom';
import { isImageMimeType, safeUploadFile } from '$utils/mimeTypes';
import { useSetting } from '$state/hooks/settings';
import type { EditorButtonId } from '$state/settings';
import { settingsAtom } from '$state/settings';
import { matchesShortcut } from '../../keyboard/shortcuts';
import { getEditedEvent, getThreadReplyEvents } from '$utils/room/relations';
import { htmlToMarkdown } from '$plugins/markdown';
import { Command, useCommands } from '$hooks/useCommands';
import { isMobileOrTablet, isMobileTauri } from '$utils/platform';
import { Reply, ThreadIndicator } from '$components/message';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { nicknamesAtom } from '$state/nicknames';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useImagePackRooms } from '$hooks/useImagePackRooms';
import { useComposingCheck } from '$hooks/useComposingCheck';
import { createLogger } from '$utils/debug';
import { createDebugLogger } from '$utils/debugLogger';
import FocusTrap from 'focus-trap-react';
import { useQueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import {
  delayedEventsSupportedAtom,
  getScheduledMessageStateKey,
  roomIdToScheduledTimeAtomFamily,
  roomIdToEditingScheduledDelayIdAtomFamily,
  serverMaxDelayMsAtom,
} from '$state/scheduledMessages';
import {
  sendDelayedMessage,
  sendDelayedMessageE2EE,
  computeDelayMs,
  cancelDelayedEvent,
} from '$utils/delayedEvents';
import { roomScheduleCoordinator } from '$state/room/roomScheduleCoordinator';
import { timeHourMinute, timeDayMonthYear, daysToMs } from '$utils/time';
import { stopPropagation } from '$utils/keyboard';

import { usePowerLevelsContext } from '$hooks/usePowerLevels';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { AutocompleteNotice } from '$components/editor/autocomplete/AutocompleteNotice';
import { MarkdownPreview } from './input/MarkdownPreview';
import { setCurrentlyUsedPerMessageProfileIdForRoom } from '$hooks/usePerMessageProfile';
import type { PerMessageProfileMsc4461 } from '$app/persona';
import { ProfileCatalog } from '$app/persona/catalog';
import { projectPersona } from '$app/persona/projection';
import { resolvePersona } from '$app/persona/selection';
import {
  Bell,
  BellSlash,
  CaretDown,
  chipIcon,
  Clock,
  composerIcon,
  dropzoneIcon,
  File as FileIcon,
  Gif,
  ListBullets,
  MapPinPlusIcon,
  menuIcon,
  Microphone,
  PaperPlaneTilt,
  PencilSimple,
  getPhosphorIconSize,
  PlusCircle,
  Smiley,
  Sticker,
  Stop,
  X,
} from '$components/icons/phosphor';
import { getSupportedAudioExtension } from '$plugins/voice-recorder-kit/supportedCodec';
import { ErrorCode } from '../../cs-errorcode';
import { PKitCommandMessageHandler } from '$plugins/pluralkit-handler/PKitCommandMessageHandler';
import type { IGenericMSC4459, MSC4459ImagePackReference } from '$types/matrix/common';
import {
  getImagePackReferencesForMxc,
  getImagePackReferencesForMxcWrappedInMap,
} from '$utils/msc4459helper';
import { ImageUsage } from '$plugins/custom-emoji';
import { getPackImageInfo } from '$plugins/custom-emoji/utils';
import { SerializableMap } from '$types/wrapper/SerializableMap';
import { useSettingsLinkBaseUrl } from '$features/settings/useSettingsLinkBaseUrl';
import * as messageCss from '$features/room/message/styles.css';
import { AttachmentContent } from '$components/attachment-sheet/AttachmentContent';
import { MobileSwipeDownModal } from '$components/MobileSwipeDownModal';
import { SchedulePickerDialog } from './schedule-send';
import * as css from './schedule-send/SchedulePickerDialog.css';
import {
  getAudioMsgContent,
  getFileMsgContent,
  getImageMsgContent,
  getVideoMsgContent,
  getGifMsgContent,
  buildGalleryContent,
  getGalleryItemContent,
} from './msgContent';
import { useClientConfig } from '$hooks/useClientConfig';
import { CommandAutocomplete } from './CommandAutocomplete';
import type {
  AudioMessageRecorderHandle,
  AudioRecordingCompletePayload,
} from './AudioMessageRecorder';
import { AudioMessageRecorder } from './AudioMessageRecorder';
import * as prefix from '$unstable/prefixes';
import { PollDialog } from './poll-modals';
import { PersonaPicker, type PersonaPickerTab } from './persona-picker/PersonaPicker.tsx';
import { createComposerController, type ComposerController } from './composerController';
import { buildEditReplacement, buildOutgoingMessage } from './composerMessage';
import { pickNativeFile } from './nativeFilePicker';

const LocationDialog = lazy(() =>
  import('./location-modal').then((module) => ({ default: module.LocationDialog }))
);

// Returns the event ID of the most recent non-reaction/non-edit event in a thread,
// falling back to the thread root if no replies exist yet.
const getLatestThreadEventId = (room: Room, threadRootId: string): string => {
  const replies = getThreadReplyEvents(room, threadRootId);
  return replies.at(-1)?.getId() ?? threadRootId;
};

export const getReplyContent = (
  replyDraft: IReplyDraft | undefined,
  room?: Room
): IEventRelation => {
  if (!replyDraft) return {};

  const relatesTo: IEventRelation = {};

  // If this is a thread relation
  if (replyDraft.relation?.rel_type === RelationType.Thread) {
    relatesTo.event_id = replyDraft.relation.event_id;
    relatesTo.rel_type = RelationType.Thread;

    // If the user explicitly clicked "reply" on a message (including the thread root),
    // we must set is_falling_back=false and target that message directly.
    // (replyDraft.body being empty means it's just a seeded thread draft)
    if (replyDraft.body) {
      // Explicit reply — per spec, is_falling_back must be false
      relatesTo['m.in_reply_to'] = {
        event_id: replyDraft.eventId,
      };
      relatesTo.is_falling_back = false;
    } else {
      // Regular thread message — per spec, include fallback m.in_reply_to pointing to the
      // most recent thread message so unthreaded clients can display it as a reply chain
      const threadRootId = replyDraft.relation.event_id ?? replyDraft.eventId;
      const latestEventId = room ? getLatestThreadEventId(room, threadRootId) : threadRootId;
      relatesTo['m.in_reply_to'] = {
        event_id: latestEventId,
      };
      relatesTo.is_falling_back = true;
    }
  } else {
    // Regular reply (not in a thread)
    relatesTo['m.in_reply_to'] = {
      event_id: replyDraft.eventId,
    };
  }

  return relatesTo;
};

const log = createLogger('RoomInput');
const debugLog = createDebugLogger('RoomInput');
const ENCRYPTION_PREPARATION_INTERVAL_MS = 60_000;
interface ReplyEventContent {
  'm.relates_to'?: IEventRelation;
}

const createUploadItemKey = () =>
  globalThis.crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

interface ReplyClaim {
  epoch: number;
  snapshot: IReplyDraft;
  silentReply: boolean;
}

interface Submission {
  children: EditorDocument;
  epoch: number;
  replyClaim: ReplyClaim | undefined;
}

interface SendContentsOptions {
  contents: IContent[];
  submission: Submission;
  isLive: () => boolean;
  includeReplyWithText?: boolean;
  /** Defaults to `m.room.message`. Polls and other non-message events set this. */
  eventType?: keyof TimelineEvents;
  onContentSent?: (index: number) => void | Promise<void>;
}

interface RoomInputProps {
  editor: ProseMirrorEditorController;
  fileDropContainerRef: RefObject<HTMLElement | null>;
  roomId: string;
  room: Room;
  threadRootId?: string;
  onEditLastMessage?: () => void;
  editId?: string;
  onCancelEdit?: () => void;
}

export const RoomInput = forwardRef<HTMLDivElement, RoomInputProps>(
  (
    {
      editor,
      fileDropContainerRef,
      roomId,
      room,
      threadRootId,
      onEditLastMessage,
      editId,
      onCancelEdit,
    },
    ref
  ) => {
    // When in thread mode, isolate drafts by thread root ID so thread replies
    // don't clobber the main room draft (and vice versa).
    const draftKey = threadRootId ?? roomId;
    const mx = useMatrixClient();
    const gifProxyUrl = useClientConfig().gifs?.proxyUrl;
    const useAuthentication = useMediaAuthentication();
    const [enterForNewline] = useSetting(settingsAtom, 'enterForNewline');
    const [editorOldAddFile] = useSetting(settingsAtom, 'editorOldAddFile');
    const [editorGifButton] = useSetting(settingsAtom, 'editorGifButton');
    const [editorEmojiButton] = useSetting(settingsAtom, 'editorEmojiButton');
    const [editorStickerButton] = useSetting(settingsAtom, 'editorStickerButton');
    const [editorMicButton] = useSetting(settingsAtom, 'editorMicButton');
    const [editorButtonOrder] = useSetting(settingsAtom, 'editorButtonOrder');
    const [showMarkdownPreview] = useSetting(settingsAtom, 'showMarkdownPreview');
    const [shortcutOverrides] = useSetting(settingsAtom, 'shortcutOverrides');

    const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
    const [mentionInReplies] = useSetting(settingsAtom, 'mentionInReplies');
    const settingsLinkBaseUrl = useSettingsLinkBaseUrl();
    const commands = useCommands(mx, room);
    const imagePacksUsedRef = useRef(new SerializableMap<string, MSC4459ImagePackReference>());
    /**
     * handle pluralkit-style messages
     */
    const pluralkitCmdMessageHandler = useMemo(
      () => new PKitCommandMessageHandler(mx, room),
      [mx, room]
    );

    const [pkCompatEnable] = useSetting(settingsAtom, 'pkCompat');
    const [pmpProxyingEnable] = useSetting(settingsAtom, 'pmpProxying');
    const [pmpLatchingEnable] = useSetting(settingsAtom, 'pmpLatching');
    const [pmpPickerEnable] = useSetting(settingsAtom, 'pmpPicker');
    const [pmpNoFallback] = useSetting(settingsAtom, 'pmpNoFallback');

    const [latchedPersona, setLatchedPersona] = useState<PerMessageProfileMsc4461>();

    const emojiBtnRef = useRef<HTMLButtonElement>(null);
    const gifBtnRef = useRef<HTMLButtonElement>(null);
    const stickerBtnRef = useRef<HTMLButtonElement>(null);
    const micBtnRef = useRef<HTMLButtonElement>(null);
    // Preserve stable list keys across metadata/description replacements without
    // storing UI-only IDs in the upload draft state.
    const uploadItemKeysRef = useRef(new WeakMap<TUploadContent, string>());
    const roomToParents = useAtomValue(roomToParentsAtom);
    /**
     * Nickname someone set for another user
     * this nickname should be treated as private
     */
    const nicknames = useAtomValue(nicknamesAtom);

    const powerLevels = usePowerLevelsContext();
    const creators = useRoomCreators(room);
    const permissions = useRoomPermissions(creators, powerLevels);
    const canSendReaction = permissions.event(EventType.Reaction, mx.getSafeUserId());

    const [msgDraft, setMsgDraft] = useAtom(roomIdToMsgDraftAtomFamily(draftKey));
    const [replyDraft, setReplyDraft] = useAtom(roomIdToReplyDraftAtomFamily(draftKey));
    const replyDraftRef = useRef(replyDraft);
    replyDraftRef.current = replyDraft;

    const [uploadBoard, setUploadBoard] = useState(true);
    const [uploadSending, setUploadSending] = useState(false);
    const [uploadBusy, setUploadBusy] = useState(false);
    const [ingestingFiles, setIngestingFiles] = useState(false);
    const fileIngestionCountRef = useRef(0);
    const submissionInFlightRef = useRef(false);
    const composerControllerRef = useRef<ComposerController | undefined>(undefined);
    composerControllerRef.current ??= createComposerController();
    // Bumped when this composer goes away, so async work started for a previous
    // room/thread stops writing to the current one.
    const draftEpochRef = useRef(0);
    const mountedRef = useRef(false);
    const [selectedFiles, setSelectedFiles] = useAtom(roomIdToUploadItemsAtomFamily(draftKey));
    const selectedFilesRef = useRef(selectedFiles);
    selectedFilesRef.current = selectedFiles;
    const uploadItemOverridesRef = useRef(new Map<TUploadContent, Partial<TUploadItem>>());
    const removedUploadFilesRef = useRef(new WeakSet<TUploadContent>());
    const isEncrypting = selectedFiles.some((f) => f.encrypting);
    const sendBusy = uploadSending || isEncrypting || uploadBusy || ingestingFiles;
    const uploadFamilyObserverAtom = createUploadFamilyObserverAtom(
      roomUploadAtomFamily,
      selectedFiles.map((f) => f.file)
    );
    const uploadBoardHandlers = useRef<UploadBoardImperativeHandlers | undefined>(undefined);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLongPress = useRef(false);
    const sentOnPointerUpRef = useRef(false);
    const suppressBlurRefocusRef = useRef(false);
    const editorRafIdsRef = useRef(new Set<number>());
    const scheduleEditorRaf = useCallback((callback: () => void) => {
      const rafId = requestAnimationFrame(() => {
        editorRafIdsRef.current.delete(rafId);
        callback();
      });
      editorRafIdsRef.current.add(rafId);
    }, []);
    useEffect(
      () => () => {
        editorRafIdsRef.current.forEach((rafId) => cancelAnimationFrame(rafId));
        editorRafIdsRef.current.clear();
      },
      []
    );
    const suppressEditorRefocus = useCallback(() => {
      suppressBlurRefocusRef.current = true;
      scheduleEditorRaf(() => {
        suppressBlurRefocusRef.current = false;
      });
    }, [scheduleEditorRaf]);

    const imagePackRooms: Room[] = useImagePackRooms(roomId, roomToParents);

    const [showAudioRecorder, setShowAudioRecorder] = useState(false);
    const audioRecorderRef = useRef<AudioMessageRecorderHandle>(null);
    const micHoldStartRef = useRef(0);
    const micHoldReleaseRef = useRef<(() => void) | null>(null);
    const recorderActionRef = useRef<'stop' | 'cancel' | undefined>(undefined);
    const recorderTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const scheduleRecorderTimer = useCallback((callback: () => void) => {
      recorderTimerRef.current = setTimeout(() => {
        recorderTimerRef.current = undefined;
        callback();
      }, 50);
    }, []);
    const requestRecorderStop = useCallback(() => {
      if (recorderActionRef.current) return;
      recorderActionRef.current = 'stop';
      audioRecorderRef.current?.stop();
    }, []);
    const HOLD_THRESHOLD_MS = 400;

    useEffect(
      () => () => {
        micHoldReleaseRef.current?.();
        clearTimeout(recorderTimerRef.current);
        recorderActionRef.current = undefined;
      },
      []
    );
    const [autocompleteQuery, setAutocompleteQuery, handleCloseAutocomplete] =
      useAutocompleteQuery(editor);
    const [isQuickTextReact, setQuickTextReact] = useState(false);

    const replyDraftBase = useMemo(
      () =>
        threadRootId
          ? {
              userId: mx.getUserId() ?? '',
              eventId: threadRootId,
              body: '',
              relation: { rel_type: RelationType.Thread, event_id: threadRootId },
            }
          : undefined,
      [mx, threadRootId]
    );

    const sendTypingStatus = useTypingStatusUpdater(mx, roomId, { disabled: !!threadRootId });

    useEffect(() => {
      mountedRef.current = true;
      const controller = (composerControllerRef.current ??= createComposerController());
      return () => {
        mountedRef.current = false;
        draftEpochRef.current += 1;
        controller.dispose();
        composerControllerRef.current = undefined;
      };
    }, [draftKey]);

    const getUploadItemKey = useCallback((fileItem: TUploadItem): string => {
      const existingKey = uploadItemKeysRef.current.get(fileItem.originalFile);
      if (existingKey) return existingKey;

      const nextKey = createUploadItemKey();
      uploadItemKeysRef.current.set(fileItem.originalFile, nextKey);
      return nextKey;
    }, []);

    const handleFiles = useCallback(
      async (
        files: File[],
        audioMeta?: { waveform: number[]; audioDuration: number },
        options?: { alreadyInMemory?: boolean }
      ) => {
        const epoch = draftEpochRef.current;
        fileIngestionCountRef.current += 1;
        setIngestingFiles(true);
        try {
          setUploadBoard(true);
          const safeFiles = await Promise.all(files.map(safeUploadFile));
          if (epoch !== draftEpochRef.current || !mountedRef.current) return;

          // Eager-read to avoid Android content URI expiry after SAF picker
          const blobbedFiles =
            isMobileOrTablet() && !options?.alreadyInMemory
              ? await Promise.all(
                  safeFiles.map(async (f) => {
                    try {
                      const buf = await f.arrayBuffer();
                      return new File([buf], f.name, {
                        type: f.type,
                        lastModified: f.lastModified,
                      });
                    } catch {
                      return f;
                    }
                  })
                )
              : safeFiles;
          if (epoch !== draftEpochRef.current || !mountedRef.current) return;
          blobbedFiles.forEach((file) => removedUploadFilesRef.current.delete(file));

          const makeMetadata = () => ({
            markedAsSpoiler: false,
            waveform: audioMeta?.waveform,
            audioDuration: audioMeta?.audioDuration,
          });

          if (room.hasEncryptionStateEvent()) {
            const placeholders: TUploadItem[] = blobbedFiles.map((f) => ({
              file: f,
              originalFile: f,
              encInfo: undefined,
              encrypting: true,
              metadata: makeMetadata(),
            }));
            setSelectedFiles({ type: 'PUT', item: placeholders });
            await Promise.all(
              placeholders.map(async (placeholder) => {
                try {
                  const encryptedFile = await encryptFile(placeholder.originalFile);
                  if (epoch !== draftEpochRef.current || !mountedRef.current) return;
                  if (removedUploadFilesRef.current.has(placeholder.originalFile)) return;
                  const currentItem = selectedFilesRef.current.find(
                    (item) => item.originalFile === placeholder.originalFile
                  );
                  if (!currentItem) return;
                  const overrides = uploadItemOverridesRef.current.get(placeholder.originalFile);
                  setSelectedFiles({
                    type: 'REPLACE',
                    item: currentItem,
                    replacement: {
                      ...currentItem,
                      ...encryptedFile,
                      ...overrides,
                      encrypting: false,
                      metadata: overrides?.metadata ?? currentItem.metadata,
                    },
                  });
                } catch (encryptError: unknown) {
                  log.warn('Failed to encrypt file for upload:', encryptError);
                  if (epoch === draftEpochRef.current && mountedRef.current) {
                    const currentItem = selectedFilesRef.current.find(
                      (item) => item.originalFile === placeholder.originalFile
                    );
                    if (currentItem) setSelectedFiles({ type: 'DELETE', item: currentItem });
                  }
                }
              })
            );
            return;
          }

          setSelectedFiles({
            type: 'PUT',
            item: blobbedFiles.map((f) => ({
              file: f,
              originalFile: f,
              encInfo: undefined,
              metadata: makeMetadata(),
            })),
          });
        } catch (error: unknown) {
          log.warn('Failed to prepare files for upload:', error);
        } finally {
          fileIngestionCountRef.current -= 1;
          if (fileIngestionCountRef.current === 0 && mountedRef.current) setIngestingFiles(false);
        }
      },
      [room, setSelectedFiles]
    );
    const pickFile = useFilePicker(handleFiles, true);
    const pickAttachment = useCallback(
      async (pickerMode: 'media' | 'document', accept: string) => {
        if (!isMobileTauri()) {
          await pickFile(accept);
          return;
        }

        try {
          const files = await pickNativeFile(pickerMode, (source, error) => {
            log.warn('Native attachment file error:', source, error);
          });
          if (files.length > 0) await handleFiles(files, undefined, { alreadyInMemory: true });
        } catch (error) {
          log.error('Failed to open native attachment picker', { roomId }, error);
        }
      },
      [handleFiles, pickFile, roomId]
    );
    const handlePaste = useFilePasteHandler(handleFiles);
    const dropZoneVisible = useFileDropZone(fileDropContainerRef, handleFiles);
    const [hasText, setHasText] = useState(false);
    const [markdownPreview, setMarkdownPreview] = useState('');
    const lastEncryptionPreparationAt = useRef(0);
    const detectAutocomplete = useCallback(() => {
      const quickReactPrefix = editor.getText().slice(0, 2);
      if (quickReactPrefix === '+#') {
        setQuickTextReact(true);
        setAutocompleteQuery(undefined);
        return;
      }
      setQuickTextReact(false);

      const query =
        editor.getAutocompleteQuery(BEGINNING_AUTOCOMPLETE_PREFIXES, true) ??
        editor.getAutocompleteQuery(ANYWHERE_AUTOCOMPLETE_PREFIXES);

      setAutocompleteQuery(query);
    }, [editor, setAutocompleteQuery]);

    const handleEditorChange = useCallback(() => {
      setHasText(!editor.isEmpty());
      setMarkdownPreview(showMarkdownPreview ? editor.getMarkdownPreviewText() : '');
      detectAutocomplete();
      if (!room.hasEncryptionStateEvent()) return;

      const now = Date.now();
      if (now - lastEncryptionPreparationAt.current < ENCRYPTION_PREPARATION_INTERVAL_MS) return;

      lastEncryptionPreparationAt.current = now;
      mx.getCrypto()?.prepareToEncrypt(room);
    }, [editor, showMarkdownPreview, detectAutocomplete, mx, room]);
    // handleEditorChange only runs on edits, so toggling the preview on with
    // an existing draft needs a separate sync.
    useEffect(() => {
      setMarkdownPreview(showMarkdownPreview ? editor.getMarkdownPreviewText() : '');
    }, [editor, showMarkdownPreview]);
    const hasContent = hasText || selectedFiles.length > 0;

    const isComposing = useComposingCheck();

    const queryClient = useQueryClient();
    const delayedEventsSupported = useAtomValue(delayedEventsSupportedAtom);
    const scheduledStateKey = getScheduledMessageStateKey(mx.getSafeUserId(), roomId);
    const [roomScheduledTime, setRoomScheduledTime] = useAtom(
      roomIdToScheduledTimeAtomFamily(scheduledStateKey)
    );
    const [roomEditingScheduledDelayId, setRoomEditingScheduledDelayId] = useAtom(
      roomIdToEditingScheduledDelayIdAtomFamily(scheduledStateKey)
    );
    const scheduledTime = threadRootId ? null : roomScheduledTime;
    const editingScheduledDelayId = threadRootId ? null : roomEditingScheduledDelayId;
    const setScheduledTime = useCallback(
      (value: Date | null) => {
        if (!threadRootId) setRoomScheduledTime(value);
      },
      [setRoomScheduledTime, threadRootId]
    );
    const setEditingScheduledDelayId = useCallback(
      (value: string | null) => {
        if (!threadRootId) setRoomEditingScheduledDelayId(value);
      },
      [setRoomEditingScheduledDelayId, threadRootId]
    );
    const [AddMenuAnchor, setAddMenuAnchor] = useState<RectCords>();
    const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
    const attachmentSkipReturnFocusRef = useRef(false);
    const emojiBoardSkipReturnFocusRef = useRef(true);
    const [showPollPicker, setShowPollPicker] = useState(false);
    const [showLocationPicker, setShowLocationPicker] = useState(false);
    const [scheduleMenuAnchor, setScheduleMenuAnchor] = useState<RectCords>();
    const [showSchedulePicker, setShowSchedulePicker] = useState(false);
    const [silentReply, setSilentReply] = useState(!mentionInReplies);
    // Clears the reply draft up front so it cannot be re-sent, keeping a snapshot to
    // restore if the send never lands.
    const claimedReplyEventIdRef = useRef<string | undefined>(undefined);
    const claimReply = useCallback((): ReplyClaim | undefined => {
      const currentReply = replyDraftRef.current;
      if (!currentReply) return undefined;

      const epoch = draftEpochRef.current;
      claimedReplyEventIdRef.current = currentReply.eventId;
      replyDraftRef.current = replyDraftBase;
      setReplyDraft(replyDraftBase);
      return { epoch, snapshot: structuredClone(currentReply), silentReply };
    }, [replyDraftBase, setReplyDraft, silentReply]);
    const restoreReplyClaim = useCallback(
      (claim: ReplyClaim | undefined) => {
        if (!claim || claim.epoch !== draftEpochRef.current) return;
        if (replyDraftRef.current !== replyDraftBase) return;
        replyDraftRef.current = claim.snapshot;
        setReplyDraft(claim.snapshot);
        claimedReplyEventIdRef.current = undefined;
      },
      [replyDraftBase, setReplyDraft]
    );
    const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
    const setServerMaxDelayMs = useSetAtom(serverMaxDelayMsAtom);
    const [sendError, setSendError] = useState<string | undefined>();
    const isEncrypted = room.hasEncryptionStateEvent();
    const [emojiBoardTab, setEmojiBoardTab] = useState<EmojiBoardTab | undefined>(undefined);
    const [initialGifSearch, setInitialGifSearch] = useState<string>();
    const closeEmojiBoard = useCallback(() => {
      if (isMobileOrTablet()) {
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement) activeElement.blur();
      }
      setInitialGifSearch(undefined);
      setEmojiBoardTab(undefined);
    }, []);
    const toggleEmojiBoardTab = useCallback((tab: EmojiBoardTab) => {
      setEmojiBoardTab((prev) => {
        if (prev !== tab) {
          if (prev === undefined && isMobileOrTablet()) {
            const activeElement = document.activeElement;
            if (activeElement instanceof HTMLElement) activeElement.blur();
          }
          return tab;
        }
        if (isMobileOrTablet()) {
          const activeElement = document.activeElement;
          if (activeElement instanceof HTMLElement) activeElement.blur();
        }
        return undefined;
      });
    }, []);

    const [personaPickerTab, setPersonaPickerTab] = useState<PersonaPickerTab | undefined>(
      undefined
    );

    const [enableMediaGalleries] = useSetting(settingsAtom, 'enableMediaGalleries');
    const [sendIndividualAttachmentAsCaption] = useSetting(
      settingsAtom,
      'sendIndividualAttachmentAsCaption'
    );

    const replyEvent = replyDraft ? room.findEventById(replyDraft.eventId) : undefined;

    // Seed the reply draft with the thread relation whenever we're in thread
    // mode (e.g. on first render or when the thread root changes). We use the
    // current user's ID as userId so that the mention logic skips it.
    useEffect(() => {
      if (!threadRootId) return;
      setReplyDraft((prev) => {
        if (
          prev?.relation?.rel_type === RelationType.Thread &&
          prev.relation.event_id === threadRootId
        )
          return prev;
        return {
          userId: mx.getUserId() ?? '',
          eventId: threadRootId,
          body: '',
          relation: { rel_type: RelationType.Thread, event_id: threadRootId },
        };
      });
    }, [threadRootId, setReplyDraft, mx]);

    // Rewritten with equal content on unmount, and appending it again would duplicate it.
    const appliedDraftRef = useRef<string | undefined>(undefined);
    useEffect(() => {
      const draft = JSON.stringify(msgDraft);
      if (appliedDraftRef.current === draft) return;
      appliedDraftRef.current = draft;
      editor.appendDocument(msgDraft);
    }, [editor, msgDraft]);

    const editingStateRef = useRef(false);
    const preEditDraftRef = useRef<EditorDocument | undefined>(undefined);
    useEffect(
      () => () => {
        if (editingStateRef.current) {
          setMsgDraft(structuredClone(preEditDraftRef.current ?? []) as EditorDocument);
        } else if (editor.isEmpty()) {
          setMsgDraft([]);
        } else {
          const parsedDraft = structuredClone(editor.children);
          setMsgDraft(parsedDraft as EditorDocument);
        }
        editor.clear();
      },
      [draftKey, editor, setMsgDraft]
    );

    const editingEvent = editId ? room.findEventById(editId) : undefined;
    const isMobile = isMobileOrTablet();
    const [initializedEditId, setInitializedEditId] = useState<string>();
    const isEditInitializing = isMobile && editId !== undefined && initializedEditId !== editId;
    const getEditingContent = useCallback(
      (event: MatrixEvent): IContent => {
        const eventId = event.getId();
        const timeline = eventId ? room.getTimelineForEvent(eventId) : undefined;
        const latestEdit =
          eventId && timeline
            ? getEditedEvent(eventId, event, timeline.getTimelineSet())
            : undefined;
        return latestEdit?.getContent()['m.new_content'] ?? event.getContent();
      },
      [room]
    );

    const prevEditingEventId = useRef<string | undefined>(undefined);
    useEffect(() => {
      if (!isMobile) {
        editingStateRef.current = false;
        prevEditingEventId.current = undefined;
        preEditDraftRef.current = undefined;
        setInitializedEditId(undefined);
        return;
      }

      if (editId !== undefined && !editingEvent) {
        setInitializedEditId(undefined);
        onCancelEdit?.();
        return;
      }

      if (editingEvent) {
        editingStateRef.current = true;
        if (editingEvent.getId() !== prevEditingEventId.current) {
          if (!prevEditingEventId.current) {
            preEditDraftRef.current = structuredClone(editor.children);
          }
          prevEditingEventId.current = editingEvent.getId();

          const content = getEditingContent(editingEvent);
          let bodyText = (content.body as string | undefined) ?? '';
          const customHtml = (content.formatted_body as string | undefined) ?? undefined;

          const rawPmp = content['com.beeper.per_message_profile'];
          const pmpDisplayname =
            rawPmp !== null &&
            typeof rawPmp === 'object' &&
            'displayname' in rawPmp &&
            typeof rawPmp.displayname === 'string' &&
            rawPmp.displayname.length > 0
              ? (rawPmp.displayname as string)
              : undefined;

          if (pmpDisplayname && typeof bodyText === 'string') {
            const bodyPrefix = `${pmpDisplayname}: `;
            if (bodyText.startsWith(bodyPrefix)) {
              bodyText = bodyText.slice(bodyPrefix.length);
            }
          }
          const editableHtml = pmpDisplayname
            ? customHtml?.replace(/^<strong\s+data-mx-profile-fallback[^>]*>.*?<\/strong>/, '')
            : customHtml;

          const mentionOptions = {
            room,
            nicknames,
            mxUserId: mx.getUserId() ?? undefined,
          };

          const initialValue = plainToEditorInput(
            editableHtml
              ? stripMarkdownEscapesForHiddenPreviews(htmlToMarkdown(editableHtml))
              : typeof bodyText === 'string'
                ? stripMarkdownEscapesForHiddenPreviews(bodyText)
                : '',
            mentionOptions
          );

          editor.setDocument(initialValue);

          scheduleEditorRaf(() => {
            try {
              editor.focus();
            } catch {
              // Ignore focus error
            }
          });
        }
        setInitializedEditId(editId);
      } else {
        editingStateRef.current = false;
        const previousDraft = preEditDraftRef.current;
        if (prevEditingEventId.current && previousDraft) {
          editor.setDocument(previousDraft);
        }
        preEditDraftRef.current = undefined;
        if (
          prevEditingEventId.current &&
          (!replyDraft?.eventId || replyDraft.eventId === threadRootId)
        ) {
          scheduleEditorRaf(() => {
            try {
              editor.blur();
              (document.activeElement as HTMLElement)?.blur();
            } catch {
              // Ignore blur error
            }
          });
        }
        prevEditingEventId.current = undefined;
        setInitializedEditId(undefined);
      }
    }, [
      editId,
      editingEvent,
      editor,
      getEditingContent,
      mx,
      nicknames,
      room,
      replyDraft?.eventId,
      threadRootId,
      isMobile,
      setInitializedEditId,
      onCancelEdit,
      scheduleEditorRaf,
    ]);

    useEffect(() => {
      if (editId && replyDraft?.eventId && replyDraft.eventId !== threadRootId) {
        if (threadRootId) {
          setReplyDraft({
            userId: mx.getUserId() ?? '',
            eventId: threadRootId,
            body: '',
            relation: { rel_type: RelationType.Thread, event_id: threadRootId },
          });
        } else {
          setReplyDraft(undefined);
        }
      }
    }, [editId, threadRootId, setReplyDraft, mx, replyDraft?.eventId]);

    useEffect(() => {
      if (replyDraft !== undefined) {
        setSilentReply(replyDraft.userId === mx.getUserId() || !mentionInReplies);
      }
    }, [mentionInReplies, mx, replyDraft]);

    const prevReplyEventId = useRef(replyDraft?.eventId);
    useEffect(() => {
      const prevId = prevReplyEventId.current;
      const newId = replyDraft?.eventId;

      if (newId !== prevId) {
        prevReplyEventId.current = newId;

        if (newId && newId !== threadRootId) {
          scheduleEditorRaf(() => {
            try {
              editor.focus();
            } catch {
              // Ignore focus errors
            }
          });
        } else if (
          !newId &&
          prevId &&
          prevId !== threadRootId &&
          !editId &&
          prevId !== claimedReplyEventIdRef.current
        ) {
          if (!isMobile) return;
          scheduleEditorRaf(() => {
            try {
              editor.blur();
              (document.activeElement as HTMLElement)?.blur();
            } catch {
              // Ignore blur errors
            }
          });
        }
      }
    }, [replyDraft?.eventId, threadRootId, editId, isMobile, editor, scheduleEditorRaf]);

    const handleFileMetadata = useCallback(
      (fileItem: TUploadItem, metadata: TUploadMetadata) => {
        uploadItemOverridesRef.current.set(fileItem.originalFile, {
          ...uploadItemOverridesRef.current.get(fileItem.originalFile),
          metadata,
        });
        setSelectedFiles({
          type: 'REPLACE',
          item: fileItem,
          replacement: { ...fileItem, metadata },
        });
      },
      [setSelectedFiles]
    );
    const setDesc = useCallback(
      (fileItem: TUploadItem, body: string, formatted_body: string) => {
        uploadItemOverridesRef.current.set(fileItem.originalFile, {
          ...uploadItemOverridesRef.current.get(fileItem.originalFile),
          body,
          formatted_body,
        });
        setSelectedFiles({
          type: 'REPLACE',
          item: fileItem,
          replacement: { ...fileItem, body, formatted_body },
        });
      },
      [setSelectedFiles]
    );
    const handleRemoveUpload = useCallback(
      (upload: TUploadContent | TUploadContent[]) => {
        const uploads = Array.isArray(upload) ? upload : [upload];
        setSelectedFiles({
          type: 'DELETE',
          item: selectedFiles.filter((f) => uploads.find((u) => u === f.file)),
        });
        uploads.forEach((u) => {
          removedUploadFilesRef.current.add(u);
          roomUploadAtomFamily.remove(u);
          uploadItemOverridesRef.current.delete(u);
        });
      },
      [setSelectedFiles, selectedFiles]
    );

    const handleAudioRecordingComplete = useCallback(
      (payload: AudioRecordingCompletePayload) => {
        recorderActionRef.current = undefined;
        const extension = getSupportedAudioExtension(payload.audioCodec);
        const file = new File(
          [payload.audioBlob],
          `sable-audio-message-${Date.now()}.${extension}`,
          {
            type: payload.audioCodec,
          }
        );
        handleFiles([file], {
          waveform: payload.waveform,
          audioDuration: payload.audioLength,
        });
        setShowAudioRecorder(false);
      },
      [handleFiles]
    );

    const audioRecorder = showAudioRecorder ? (
      <AudioMessageRecorder
        ref={audioRecorderRef}
        onRequestClose={() => {
          recorderActionRef.current = undefined;
          setShowAudioRecorder(false);
        }}
        onRecordingComplete={handleAudioRecordingComplete}
        onAudioLengthUpdate={() => {}}
        onWaveformUpdate={() => {}}
      />
    ) : undefined;

    const handleCancelUpload = (uploads: Upload[]) => {
      uploads.forEach((upload) => {
        if (upload.status === UploadStatus.Loading) {
          cancelUploadContent(mx, upload.promise);
        }
      });
      handleRemoveUpload(uploads.map((upload) => upload.file));
    };

    // Clears the composer immediately so a slow send cannot be edited or submitted
    // twice; anything that fails without a local echo is restored afterwards.
    const takeSubmission = useCallback(
      ({ clearEditor = true, claimReplyDraft = true } = {}): Submission => {
        const children = structuredClone(editor.children);
        const submission: Submission = {
          children,
          epoch: draftEpochRef.current,
          replyClaim: claimReplyDraft ? claimReply() : undefined,
        };
        if (clearEditor) {
          editor.clear();
          // The draft outlives this component, and a remount re-applies it.
          setMsgDraft([]);
          imagePacksUsedRef.current.clear();
          sendTypingStatus(false);
        }
        return submission;
      },
      [claimReply, editor, sendTypingStatus, setMsgDraft]
    );
    const restoreSubmission = useCallback(
      (submission: Submission) => {
        restoreReplyClaim(submission.replyClaim);
        if (
          !mountedRef.current ||
          submission.epoch !== draftEpochRef.current ||
          !editor.isEmpty()
        ) {
          return;
        }
        editor.appendDocument(submission.children);
      },
      [editor, restoreReplyClaim]
    );

    const handleSendContents = async ({
      contents,
      submission,
      isLive,
      includeReplyWithText = false,
      eventType,
      onContentSent,
    }: SendContentsOptions) => {
      const plainText = toPlainText(submission.children as EditorDocument).trim();
      const submittedReplyDraft = submission.replyClaim?.snapshot;
      const submittedSilentReply = submission.replyClaim?.silentReply ?? silentReply;

      const catalog = new ProfileCatalog(mx);
      const [account, roomSelection] = await Promise.all([
        catalog.getSelection('account'),
        catalog.getSelection({ roomId }),
      ]);
      const perMessageProfile = resolvePersona({
        latched: latchedPersona,
        room: roomSelection,
        account,
        now: Date.now(),
      });

      if (perMessageProfile) {
        contents.forEach((c) => {
          c[prefix.MATRIX_UNSTABLE_PER_MESSAGE_PROFILE_PROPERTY_NAME] =
            projectPersona(perMessageProfile);
        });
      }

      const replyContent =
        submittedReplyDraft && (includeReplyWithText || plainText.length === 0)
          ? getReplyContent(submittedReplyDraft, room)
          : undefined;
      if (replyContent && contents.length > 0) {
        contents[0]!['m.relates_to'] = replyContent;
        if (!submittedSilentReply && submittedReplyDraft)
          contents[0]!['m.mentions'] = { ['user_ids']: [submittedReplyDraft.userId] };
      }

      const invalidate = () => {
        if (isLive()) queryClient.invalidateQueries({ queryKey: ['delayedEvents', roomId] });
      };
      const handleContentSent = async (index: number) => {
        if (onContentSent && isLive()) await onContentSent(index);
      };

      if (scheduledTime) {
        try {
          const delayMs = computeDelayMs(scheduledTime);
          await roomScheduleCoordinator.run(mx, roomId, async () => {
            if (editingScheduledDelayId) {
              await cancelDelayedEvent(mx, editingScheduledDelayId);
              if (isLive()) setEditingScheduledDelayId(null);
            }

            const sendResults = await Promise.allSettled(
              contents.map(async (content, index) => {
                const response = isEncrypted
                  ? await sendDelayedMessageE2EE(
                      mx,
                      roomId,
                      room,
                      content,
                      delayMs,
                      null,
                      eventType
                    )
                  : await sendDelayedMessage(mx, roomId, content, delayMs, null, eventType);
                await handleContentSent(index);
                return response;
              })
            );
            const failedSend = sendResults.find(
              (result): result is PromiseRejectedResult => result.status === 'rejected'
            );
            if (failedSend) throw failedSend.reason;
          });

          invalidate();
          if (isLive()) {
            setEditingScheduledDelayId(null);
            setScheduledTime(null);
          }
          return contents.length > 0;
        } catch (error) {
          debugLog.error('message', 'Failed to schedule message', {
            roomId,
            error: error instanceof Error ? error.message : String(error),
          });
          log.error('failed to schedule message', { roomId }, error);
          throw error;
        }
      } else {
        const sendImmediateContents = async () =>
          Promise.allSettled(
            contents.map(async (content, index) => {
              try {
                const res = eventType
                  ? await mx.sendEvent(
                      roomId,
                      threadRootId ?? null,
                      eventType,
                      content as TimelineEvents[keyof TimelineEvents]
                    )
                  : await mx.sendMessage(
                      roomId,
                      threadRootId ?? null,
                      content as RoomMessageEventContent
                    );
                await handleContentSent(index);
                debugLog.info('message', 'Message sent', {
                  roomId,
                  eventId: res.event_id,
                  msgtype: content.msgtype,
                });
                return res;
              } catch (error: unknown) {
                debugLog.error('message', 'Failed to send message', {
                  roomId,
                  error: error instanceof Error ? error.message : String(error),
                });
                log.error('failed to send message', { roomId }, error);
                throw error;
              }
            })
          );
        let sendResults: PromiseSettledResult<unknown>[] = [];
        if (editingScheduledDelayId) {
          let cancellationFailed = false;
          await roomScheduleCoordinator.run(mx, roomId, async () => {
            try {
              await cancelDelayedEvent(mx, editingScheduledDelayId);
              invalidate();
              if (isLive()) setEditingScheduledDelayId(null);
            } catch {
              cancellationFailed = true;
              debugLog.error('message', 'Failed to cancel scheduled event before immediate send', {
                roomId,
              });
              return;
            }
            sendResults = await sendImmediateContents();
          });
          if (cancellationFailed) sendResults = await sendImmediateContents();
        } else {
          sendResults = await sendImmediateContents();
        }
        const failedSend = sendResults.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected'
        );
        if (failedSend) throw failedSend.reason;
        return contents.length > 0;
      }
    };

    const uploadToContent = async (upload: UploadSuccess) => {
      const fileItem = selectedFiles.find((f) => f.file === upload.file);
      if (!fileItem) throw new Error('Broken upload');

      if (isImageMimeType(fileItem.file.type)) {
        return getImageMsgContent(mx, fileItem, upload.mxc);
      }
      if (fileItem.file.type.startsWith('video')) {
        return getVideoMsgContent(mx, fileItem, upload.mxc);
      }
      if (fileItem.file.type.startsWith('audio')) {
        return getAudioMsgContent(fileItem, upload.mxc);
      }
      return getFileMsgContent(fileItem, upload.mxc);
    };

    // Resolves true when the composer text went out as an attachment caption, meaning
    // the caller must not send it again.
    const handleSendUpload = async (
      uploads: Upload[],
      submission: Submission,
      isLive: () => boolean
    ): Promise<boolean> => {
      const plainText = toPlainText(submission.children as EditorDocument).trim();
      const caption = plainText.length > 0 ? plainText : undefined;
      let customHtml = trimCustomHtml(
        toMatrixCustomHTML(submission.children as EditorDocument, {
          stripNickname: true,
          room,
        })
      );
      const formattedCaption =
        caption && !customHtmlEqualsPlainText(customHtml, plainText) ? customHtml : undefined;

      if (uploads.length !== selectedFiles.length) throw new Error('Upload not ready');
      const resolved = await Promise.all(
        uploads.map(async (upload): Promise<UploadSuccess> => {
          if (upload.status === UploadStatus.Success) return upload;
          if (upload.status === UploadStatus.Loading) {
            const response = await upload.promise;
            if (!response.content_uri) throw new Error('Upload failed');
            return { status: UploadStatus.Success, file: upload.file, mxc: response.content_uri };
          }
          throw new Error('Upload not ready');
        })
      );
      if (resolved.length === 0) throw new Error('Upload not ready');

      if (selectedFiles.length == 1 && sendIndividualAttachmentAsCaption) {
        const upload = resolved[0];
        if (!upload) throw new Error('Broken upload');
        let content = await uploadToContent(upload);

        content.body = caption ?? '';
        content.formatted_body = undefined;

        if (formattedCaption) {
          content.format = 'org.matrix.custom.html';
          content.formatted_body = formattedCaption;
        }

        await handleSendContents({
          contents: [content],
          submission,
          isLive,
          includeReplyWithText: true,
        });
        if (isLive()) handleCancelUpload(resolved);
        return true;
      }
      if (selectedFiles.length >= 2 && enableMediaGalleries) {
        const itemsPromises = resolved.map(async (upload) => {
          const fileItem = selectedFiles.find((f) => f.file === upload.file);
          if (!fileItem) throw new Error('Broken upload');
          return getGalleryItemContent(mx, fileItem, upload.mxc);
        });
        const items = await Promise.all(itemsPromises);

        const galleryContent = buildGalleryContent(items, caption, formattedCaption);

        await handleSendContents({
          contents: [galleryContent],
          submission,
          isLive,
          includeReplyWithText: true,
        });
        if (isLive()) handleCancelUpload(resolved);
        return true;
      }
      const contents = await Promise.all(resolved.map(uploadToContent));

      await handleSendContents({
        contents,
        submission,
        isLive,
        onContentSent: (index) => {
          const upload = resolved[index];
          if (upload) handleCancelUpload([upload]);
        },
      });
      return false;
    };
    // `submit` is memoized but this closure is not.
    const handleSendUploadRef = useRef(handleSendUpload);
    handleSendUploadRef.current = handleSendUpload;

    const handleDialogSendContent = async (
      content: IContent,
      eventType?: keyof TimelineEvents
    ): Promise<void> => {
      const submission = takeSubmission({ clearEditor: false });
      await composerControllerRef.current?.enqueue(async (isLive) => {
        try {
          await handleSendContents({
            contents: [content],
            submission,
            isLive,
            includeReplyWithText: true,
            eventType,
          });
        } catch (error) {
          restoreReplyClaim(submission.replyClaim);
          throw error;
        }
      });
    };

    const handleQuickReact = useCallback(
      (key: string, shortcode?: string) => {
        if (key.length > 0) {
          const lastMessage = room
            .getLiveTimeline()
            .getEvents()
            .findLast((event) =>
              (
                [
                  EventType.RoomMessage,
                  EventType.RoomMessageEncrypted,
                  EventType.Sticker,
                ] as string[]
              ).includes(event.getType())
            );
          const lastMessageId = lastMessage?.getId();

          if (lastMessageId) {
            toggleReaction(mx, room, lastMessageId, key, shortcode);
          }
        }

        editor.clear();
        sendTypingStatus(false);
        handleCloseAutocomplete();
      },
      [editor, handleCloseAutocomplete, mx, room, sendTypingStatus]
    );

    const executeSubmit = useCallback(
      async (submission: Submission, isLive: () => boolean) => {
        if (
          fileIngestionCountRef.current > 0 ||
          isEditInitializing ||
          (isMobile && editId !== undefined && !editingEvent)
        ) {
          restoreSubmission(submission);
          return;
        }

        const submittedReplyDraft = submission.replyClaim?.snapshot;
        const submittedSilentReply = submission.replyClaim?.silentReply ?? silentReply;
        if (editingEvent && isMobile) {
          const content = buildEditReplacement(submission.children as EditorDocument, {
            mx,
            room,
            roomId,
            editingEvent,
            currentContent: getEditingContent(editingEvent),
            pmpNoFallback,
          });
          if (!content) {
            if (isLive()) onCancelEdit?.();
            return;
          }
          await mx.sendMessage(roomId, content as RoomMessageEventContent);
          if (isLive()) {
            onCancelEdit?.();
            sendTypingStatus(false);
          }
          return;
        }

        if (selectedFiles.some((f) => f.encrypting)) {
          restoreSubmission(submission);
          return;
        }
        if (selectedFiles.length > 0) {
          const uploads = uploadBoardHandlers.current?.getSendableUploads() ?? [];
          const sendUpload = handleSendUploadRef.current;
          setUploadSending(true);
          try {
            if (await sendUpload(uploads, submission, isLive)) return;
          } catch (error: unknown) {
            log.error('failed to send attachments', { roomId }, error);
            if (isLive()) {
              setSendError('Failed to send attachments. Please try again.');
            }
            restoreSubmission(submission);
            return;
          } finally {
            if (isLive()) setUploadSending(false);
          }
        }

        const outgoing = await buildOutgoingMessage(submission.children as EditorDocument, {
          mx,
          room,
          roomId,
          nicknames,
          replyEvent,
          replyDraft: submittedReplyDraft,
          silentReply: submittedSilentReply,
          settingsLinkBaseUrl,
          canSendReaction,
          pkCompatEnable,
          pmpProxyingEnable,
          pmpLatchingEnable,
          pmpNoFallback,
          latchedPersona,
          isPKCommand: (text) => PKitCommandMessageHandler.isPKCommand(text),
          imagePacksUsed: imagePacksUsedRef.current,
        });

        if (outgoing.kind === 'empty') return;
        if (outgoing.kind === 'quickReact') {
          handleQuickReact(outgoing.key);
          return;
        }
        if (outgoing.kind === 'pkCommand') {
          await pluralkitCmdMessageHandler.handleMessage(outgoing.plainText);
          return;
        }
        if (outgoing.kind === 'gifSearch') {
          restoreReplyClaim(submission.replyClaim);
          if (isMobileOrTablet()) {
            const activeElement = document.activeElement;
            if (activeElement instanceof HTMLElement) activeElement.blur();
          }
          setInitialGifSearch(outgoing.query);
          setEmojiBoardTab(EmojiBoardTab.Gif);
          return;
        }
        if (outgoing.kind === 'command') {
          const { command, plainText, customHtml } = outgoing;
          if (command === Command.Poll) {
            restoreReplyClaim(submission.replyClaim);
            setShowPollPicker(true);
          } else if (command === Command.Location && plainText.trim().length === 0) {
            restoreReplyClaim(submission.replyClaim);
            setShowLocationPicker(true);
          } else commands[command as Command]?.exe(plainText, customHtml);
          return;
        }

        const { content } = outgoing;
        if (outgoing.latchPersona) {
          await setCurrentlyUsedPerMessageProfileIdForRoom(mx, roomId, outgoing.latchPersona.id);
          if (isLive()) setLatchedPersona(outgoing.latchPersona);
        }
        if (submittedReplyDraft) {
          content['m.relates_to'] = getReplyContent(submittedReplyDraft, room);
        }
        const invalidate = () => {
          if (isLive()) {
            queryClient.invalidateQueries({ queryKey: ['delayedEvents', roomId] });
          }
        };

        if (scheduledTime) {
          try {
            const delayMs = computeDelayMs(scheduledTime);
            await roomScheduleCoordinator.run(mx, roomId, async () => {
              if (editingScheduledDelayId) {
                await cancelDelayedEvent(mx, editingScheduledDelayId);
                if (isLive()) setEditingScheduledDelayId(null);
              }
              if (isEncrypted) {
                await sendDelayedMessageE2EE(mx, roomId, room, content, delayMs);
              } else {
                await sendDelayedMessage(mx, roomId, content as RoomMessageEventContent, delayMs);
              }
            });
            invalidate();
            if (isLive()) {
              setSendError(undefined);
              setEditingScheduledDelayId(null);
              setScheduledTime(null);
            }
          } catch (e: unknown) {
            // A scheduled send leaves no local echo, so hand the message back.
            restoreSubmission(submission);
            if (!isLive()) return;
            if (
              e instanceof MatrixError &&
              (e.errcode === ErrorCode.M_MAX_DELAY_EXCEEDED ||
                e.data?.['org.matrix.msc4140.errcode'] === 'M_MAX_DELAY_EXCEEDED')
            ) {
              const maxDelay =
                (e.data as { max_delay?: number })?.max_delay ??
                e.data?.['org.matrix.msc4140.max_delay'];
              if (typeof maxDelay === 'number') setServerMaxDelayMs(maxDelay);
              const maxDelayDays = maxDelay / daysToMs(1);
              setSendError(
                `Scheduled time exceeds the maximum delay allowed by this server. Please choose an earlier time. The Maximum Delay is of ${maxDelayDays} day${maxDelayDays > 1 ? 's' : ''}.`
              );
            } else {
              setSendError('Failed to schedule message. Please try again.');
            }
          }
        } else if (editingScheduledDelayId) {
          const scheduledDelayId = editingScheduledDelayId;
          try {
            await roomScheduleCoordinator.run(mx, roomId, async () => {
              await cancelDelayedEvent(mx, scheduledDelayId);
              if (isLive()) setEditingScheduledDelayId(null);
              debugLog.info('message', 'Sending message after cancelling scheduled event', {
                roomId,
                scheduledDelayId,
              });
              const res = await mx.sendMessage(
                roomId,
                threadRootId ?? null,
                content as RoomMessageEventContent
              );
              debugLog.info('message', 'Message sent successfully', {
                roomId,
                eventId: res.event_id,
              });
            });
            invalidate();
          } catch (error) {
            debugLog.error('message', 'Failed to send message after cancelling scheduled event', {
              roomId,
              error: error instanceof Error ? error.message : String(error),
            });
            // The scheduled copy may still exist, so don't drop the user's text.
            restoreSubmission(submission);
            if (isLive()) setSendError('Failed to reschedule message. Please try again.');
          }
        } else {
          const msgSendStart = performance.now();
          debugLog.info('message', 'Sending message', {
            roomId,
            msgtype: content.msgtype,
          });
          try {
            const res = await Sentry.startSpan(
              {
                name: 'message.send',
                op: 'matrix.message',
                attributes: { encrypted: String(isEncrypted) },
              },
              () => mx.sendMessage(roomId, threadRootId ?? null, content as RoomMessageEventContent)
            );
            debugLog.info('message', 'Message sent successfully', {
              roomId,
              eventId: res.event_id,
            });
            Sentry.metrics.distribution(
              'sable.message.send_latency_ms',
              performance.now() - msgSendStart,
              { attributes: { encrypted: String(isEncrypted) } }
            );
          } catch (error: unknown) {
            debugLog.error('message', 'Failed to send message', {
              roomId,
              error: error instanceof Error ? error.message : String(error),
            });
            Sentry.metrics.count('sable.message.send_error', 1, {
              attributes: { encrypted: String(isEncrypted) },
            });
            log.error('failed to send message', { roomId }, error);
            // The failed send stays in the timeline as a local echo the user can retry,
            // so the composer is intentionally left empty here.
          }
        }
      },
      [
        replyEvent,
        mx,
        roomId,
        canSendReaction,
        pkCompatEnable,
        silentReply,
        pmpProxyingEnable,
        scheduledTime,
        editingScheduledDelayId,
        nicknames,
        room,
        handleQuickReact,
        pluralkitCmdMessageHandler,
        commands,
        sendTypingStatus,
        queryClient,
        threadRootId,
        settingsLinkBaseUrl,
        isEncrypted,
        setEditingScheduledDelayId,
        setScheduledTime,
        setServerMaxDelayMs,
        selectedFiles,
        editingEvent,
        getEditingContent,
        onCancelEdit,
        restoreReplyClaim,
        restoreSubmission,
        isMobile,
        editId,
        isEditInitializing,
        pmpLatchingEnable,
        pmpNoFallback,
        latchedPersona,
      ]
    );

    const submit = useCallback(() => {
      // A mobile edit replaces an existing event, so it owns neither the draft nor the reply.
      const isMobileEdit = Boolean(editingEvent && isMobile);
      const duplicateTapWouldResend = selectedFilesRef.current.length > 0 || isMobileEdit;
      if (duplicateTapWouldResend) {
        if (submissionInFlightRef.current) return Promise.resolve(undefined);
        submissionInFlightRef.current = true;
      }
      const submission = takeSubmission({
        clearEditor: !isMobileEdit,
        claimReplyDraft: !isMobileEdit,
      });
      const queued =
        composerControllerRef.current?.enqueue((isLive) => executeSubmit(submission, isLive)) ??
        Promise.resolve(undefined);
      return queued.finally(() => {
        if (duplicateTapWouldResend) submissionInFlightRef.current = false;
      });
    }, [editingEvent, executeSubmit, isMobile, takeSubmission]);

    const handleKeyDown: KeyboardEventHandler = useCallback(
      (evt) => {
        const autocompleteMenu = document.querySelector('[data-autocomplete-menu]');
        const isMenuVisible = !!(autocompleteQuery && autocompleteMenu);

        if (isMenuVisible) {
          if (isKeyHotkey('arrowdown', evt)) {
            evt.preventDefault();
            autocompleteMenu.dispatchEvent(
              new CustomEvent('autocomplete-navigate', { detail: { direction: 1 } })
            );
            return;
          }
          if (isKeyHotkey('arrowup', evt)) {
            evt.preventDefault();
            autocompleteMenu.dispatchEvent(
              new CustomEvent('autocomplete-navigate', { detail: { direction: -1 } })
            );
            return;
          }

          if ((isKeyHotkey('enter', evt) || isKeyHotkey('tab', evt)) && !isComposing(evt)) {
            const selectedItem =
              autocompleteMenu.querySelector<HTMLButtonElement>('button[data-selected="true"]') ??
              autocompleteMenu.querySelector<HTMLButtonElement>('button');

            if (selectedItem) {
              evt.preventDefault();
              markEventConsumedByHost(evt.nativeEvent);
              selectedItem.click();
              return;
            }
          }
        }

        if (isKeyHotkey('arrowup', evt) && editor.isEmpty()) {
          if (editor.isSelectionAtStart()) {
            evt.preventDefault();
            onEditLastMessage?.();
            return;
          }
        }

        if (
          (isKeyHotkey('mod+enter', evt) || (!enterForNewline && isKeyHotkey('enter', evt))) &&
          !isComposing(evt)
        ) {
          evt.preventDefault();
          markEventConsumedByHost(evt.nativeEvent);
          submit().catch((error) => {
            log.error('submit failed', { roomId }, error);
          });
          return;
        }
        if (isKeyHotkey('escape', evt)) {
          evt.preventDefault();
          if (editingEvent && isMobileOrTablet()) {
            onCancelEdit?.();
            editor.clear();
            return;
          }
          if (showAudioRecorder) {
            audioRecorderRef.current?.cancel();
            return;
          }
          if (autocompleteQuery) {
            setAutocompleteQuery(undefined);
            return;
          }
          setReplyDraft(undefined);
        }

        if (matchesShortcut('composer.openStickerPicker', evt, shortcutOverrides)) {
          evt.preventDefault();
          setEmojiBoardTab(EmojiBoardTab.Sticker);
        }
      },
      [
        submit,
        roomId,
        setReplyDraft,
        enterForNewline,
        autocompleteQuery,
        setAutocompleteQuery,
        isComposing,
        showAudioRecorder,
        editor,
        onEditLastMessage,
        setEmojiBoardTab,
        shortcutOverrides,
        editingEvent,
        onCancelEdit,
      ]
    );

    const handleKeyUp: KeyboardEventHandler = useCallback(
      (evt) => {
        if (isKeyHotkey('escape', evt)) {
          evt.preventDefault();
          return;
        }

        if (!hideActivity) {
          sendTypingStatus(!editor.isEmpty());
        }

        detectAutocomplete();
      },
      [editor, sendTypingStatus, hideActivity, detectAutocomplete]
    );

    const handleEmoticonSelect = (key: string, shortcode: string) => {
      const emoticonEl = createEmoticonElement(key, shortcode);
      if (autocompleteQuery) {
        editor.insertInline(emoticonEl, autocompleteQuery.from, autocompleteQuery.to);
      } else {
        editor.insertInline(emoticonEl);
      }
      if (!imagePacksUsedRef.current.has(key)) {
        const imgPkRef = getImagePackReferencesForMxc(key, mx, ImageUsage.Emoticon, room);
        if (imgPkRef?.room_id && imgPkRef?.shortcode) imagePacksUsedRef.current.set(key, imgPkRef);
      }
      editor.insertText(' ');
      handleCloseAutocomplete();
    };

    const executeStickerSelect = async (mxc: string, label: string, submission: Submission) => {
      const replySnapshot = submission.replyClaim?.snapshot;
      const silentReplySnapshot = submission.replyClaim?.silentReply ?? silentReply;
      // Packs declare their own info, so sending does not need the file. Measuring it instead made
      // the send fail outright whenever the media fetch did.
      let info = getPackImageInfo(mx, room, ImageUsage.Sticker, mxc);

      if (!info) {
        const stickerUrl = mxcUrlToHttp(mx, mxc, useAuthentication);
        if (stickerUrl) {
          try {
            const { blob, image } = await loadImageElementFromMediaUrl(stickerUrl);
            info = getImageInfo(image, blob);
          } catch (error) {
            log.error('failed to measure sticker, sending without info', { mxc }, error);
          }
        }
      }

      const content: StickerEventContent & ReplyEventContent & IContent & IGenericMSC4459 = {
        body: label,
        url: mxc,
        info: info ?? {},
      };

      // add the image pack reference
      content[prefix.MATRIX_UNSTABLE_IMAGE_SOURCE_PACK_PROPERTY_NAME] =
        getImagePackReferencesForMxcWrappedInMap(mxc, mx, ImageUsage.Sticker, room);

      const catalog = new ProfileCatalog(mx);
      const [account, roomSelection] = await Promise.all([
        catalog.getSelection('account'),
        catalog.getSelection({ roomId }),
      ]);
      const perMessageProfile = resolvePersona({
        latched: latchedPersona,
        room: roomSelection,
        account,
        now: Date.now(),
      });

      if (perMessageProfile) {
        content[prefix.MATRIX_UNSTABLE_PER_MESSAGE_PROFILE_PROPERTY_NAME] =
          projectPersona(perMessageProfile);
      }
      content[prefix.MATRIX_UNSTABLE_IMAGE_SOURCE_PACK_PROPERTY_NAME] =
        getImagePackReferencesForMxcWrappedInMap(mxc, mx, ImageUsage.Sticker, room);

      if (replySnapshot) {
        content['m.relates_to'] = getReplyContent(replySnapshot, room);
        if (!silentReplySnapshot) content['m.mentions'] = { ['user_ids']: [replySnapshot.userId] };
      }
      await mx.sendEvent(roomId, EventType.Sticker, content);
    };

    const handleStickerSelect = (mxc: string, _shortcode: string, label: string) => {
      const submission = takeSubmission({ clearEditor: false });
      return composerControllerRef.current?.enqueue(async () => {
        try {
          await executeStickerSelect(mxc, label, submission);
        } catch (error) {
          log.error('failed to send sticker', { roomId }, error);
          restoreReplyClaim(submission.replyClaim);
        }
      });
    };

    const handleGifSelect = (gif: GifData, spoiler?: boolean) => {
      const submission = takeSubmission({ clearEditor: false });
      return composerControllerRef.current?.enqueue(async (isLive) => {
        try {
          const content = await getGifMsgContent(gif, {
            proxyUrl: gifProxyUrl,
            spoiler,
          });
          if (!content) throw new Error('Unsendable GIF content');

          const sent = await handleSendContents({ contents: [content], submission, isLive });
          // When the editor has text, the reply is not attached to the GIF, so hand the
          // claim back for the follow-up message to carry it.
          if (
            sent &&
            submission.replyClaim &&
            toPlainText(submission.children as EditorDocument).trim().length > 0
          )
            restoreReplyClaim(submission.replyClaim);
          return sent;
        } catch (error) {
          log.error('failed to send gif', { roomId }, error);
          restoreReplyClaim(submission.replyClaim);
          return false;
        }
      });
    };

    return (
      <div ref={ref}>
        <Overlay
          open={dropZoneVisible}
          backdrop={<OverlayBackdrop />}
          style={{ pointerEvents: 'none' }}
        >
          <OverlayCenter>
            <Dialog variant="Primary">
              <Box
                direction="Column"
                justifyContent="Center"
                alignItems="Center"
                gap="500"
                style={{ padding: toRem(60) }}
              >
                {dropzoneIcon(FileIcon)}
                <Text size="H4" align="Center">
                  {`Drop Files in "${room?.name || 'Room'}"`}
                </Text>
                <Text align="Center">Drag and drop files here or click for selection dialog</Text>
              </Box>
            </Dialog>
          </OverlayCenter>
        </Overlay>
        {autocompleteQuery?.prefix === AutocompletePrefix.RoomMention && (
          <RoomMentionAutocomplete
            roomId={roomId}
            controller={editor}
            query={autocompleteQuery!}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.UserMention && (
          <UserMentionAutocomplete
            room={room}
            controller={editor}
            query={autocompleteQuery!}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.Emoticon && (
          <EmoticonAutocomplete
            imagePackRooms={imagePackRooms}
            controller={editor}
            query={autocompleteQuery!}
            requestClose={handleCloseAutocomplete}
            onEmoticonSelected={handleEmoticonSelect}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.Reaction &&
          (canSendReaction ? (
            <EmoticonAutocomplete
              title={`React with :${autocompleteQuery!.text}`}
              imagePackRooms={imagePackRooms}
              controller={editor}
              query={autocompleteQuery!}
              requestClose={handleCloseAutocomplete}
              onEmoticonSelected={handleQuickReact}
            />
          ) : (
            <AutocompleteNotice>
              You do not have permission to send reactions in this room
            </AutocompleteNotice>
          ))}
        {autocompleteQuery?.prefix === AutocompletePrefix.Command && (
          <CommandAutocomplete
            room={room}
            controller={editor}
            query={autocompleteQuery!}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {isQuickTextReact &&
          (canSendReaction ? (
            <AutocompleteNotice>Sending as text reaction to the latest message</AutocompleteNotice>
          ) : (
            <AutocompleteNotice>
              You do not have permission to send reactions in this room
            </AutocompleteNotice>
          ))}
        <CustomEditor
          editableName="RoomInput"
          editor={editor}
          placeholder="Send a message..."
          enterKeyHint={enterForNewline ? 'enter' : 'send'}
          suppressBlurRefocusRef={suppressBlurRefocusRef}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onChange={handleEditorChange}
          onPaste={handlePaste}
          responsiveAfter={audioRecorder}
          forceMultilineLayout={showAudioRecorder}
          top={
            <>
              {showMarkdownPreview && markdownPreview.trim() !== '' && (
                <MarkdownPreview room={room} markdown={markdownPreview} />
              )}
              {selectedFiles.length > 0 && (
                <UploadBoard
                  header={
                    <UploadBoardHeader
                      open={uploadBoard}
                      onToggle={() => setUploadBoard(!uploadBoard)}
                      uploadFamilyObserverAtom={uploadFamilyObserverAtom}
                      onBusyChange={setUploadBusy}
                      imperativeHandlerRef={uploadBoardHandlers}
                      onCancel={handleCancelUpload}
                    />
                  }
                >
                  {uploadBoard && (
                    <Scroll
                      direction="Horizontal"
                      size="300"
                      hideTrack
                      visibility="Hover"
                      data-gestures="scroll"
                    >
                      <UploadBoardContent>
                        {Array.from(selectedFiles)
                          .toReversed()
                          .map((fileItem) => (
                            <UploadCardRenderer
                              key={getUploadItemKey(fileItem)}
                              isEncrypted={!!fileItem.encInfo}
                              fileItem={fileItem}
                              setMetadata={handleFileMetadata}
                              onRemove={handleRemoveUpload}
                              setDesc={setDesc}
                              roomId={roomId}
                              hideCaption={
                                selectedFiles.length == 1 && sendIndividualAttachmentAsCaption
                              }
                            />
                          ))}
                      </UploadBoardContent>
                    </Scroll>
                  )}
                </UploadBoard>
              )}
              {scheduledTime && (
                <div>
                  <Box
                    alignItems="Center"
                    gap="300"
                    style={{
                      padding: `${config.space.S200} ${config.space.S300} 0`,
                    }}
                  >
                    <IconButton
                      onClick={() => {
                        setScheduledTime(null);
                        setEditingScheduledDelayId(null);
                        setSendError(undefined);
                      }}
                      variant="SurfaceVariant"
                      size="300"
                      radii="300"
                      title="schedule message send"
                    >
                      {chipIcon(X)}
                    </IconButton>
                    <Box direction="Row" gap="200" alignItems="Center">
                      {menuIcon(Clock)}
                      <Text size="T300">
                        Scheduled for {timeDayMonthYear(scheduledTime.getTime())} at{' '}
                        {timeHourMinute(scheduledTime.getTime(), hour24Clock)}
                      </Text>
                    </Box>
                  </Box>
                </div>
              )}
              {sendError && (
                <div>
                  <Box
                    alignItems="Center"
                    gap="300"
                    style={{ padding: `${config.space.S200} ${config.space.S300} 0` }}
                  >
                    <Text style={{ color: color.Critical.Main }} size="T300">
                      {sendError}
                    </Text>
                  </Box>
                </div>
              )}
              {editingEvent && isMobileOrTablet() && (
                <div>
                  <Box
                    alignItems="Center"
                    gap="300"
                    style={{
                      padding: `${config.space.S200} ${config.space.S300} 0`,
                    }}
                  >
                    <IconButton
                      onClick={() => {
                        onCancelEdit?.();
                        editor.clear();
                      }}
                      variant="SurfaceVariant"
                      style={{ background: 'transparent' }}
                      size="300"
                      radii="300"
                      aria-label="Cancel editing"
                      title="Cancel editing"
                    >
                      {chipIcon(X)}
                    </IconButton>
                    <Box
                      direction="Row"
                      gap="200"
                      alignItems="Center"
                      grow="Yes"
                      style={{ minWidth: 0 }}
                    >
                      {menuIcon(PencilSimple)}
                      <Text size="T300" truncate>
                        Editing message: {editingEvent.getContent().body as string}
                      </Text>
                    </Box>
                  </Box>
                </div>
              )}
              {replyDraft && (!threadRootId || replyDraft.body) && (
                <div>
                  <Box
                    alignItems="Center"
                    gap="300"
                    style={{
                      padding: `${config.space.S200} ${config.space.S300} 0`,
                    }}
                  >
                    <IconButton
                      onClick={() => {
                        if (threadRootId) {
                          setReplyDraft({
                            userId: mx.getUserId() ?? '',
                            eventId: threadRootId,
                            body: '',
                            relation: {
                              rel_type: RelationType.Thread,
                              event_id: threadRootId,
                            },
                          });
                        } else {
                          setReplyDraft(undefined);
                        }
                      }}
                      variant="SurfaceVariant"
                      style={{ background: 'transparent' }}
                      size="300"
                      radii="300"
                      aria-label="Cancel reply"
                      title="Cancel reply"
                    >
                      {chipIcon(X)}
                    </IconButton>
                    <Box
                      direction="Row"
                      gap="200"
                      alignItems="Center"
                      grow="Yes"
                      style={{ minWidth: 0 }}
                    >
                      <Box
                        direction="Row"
                        gap="200"
                        alignItems="Center"
                        grow="Yes"
                        style={{ minWidth: 0 }}
                      >
                        {replyDraft.relation?.rel_type === RelationType.Thread && !threadRootId && (
                          <ThreadIndicator />
                        )}
                        <Reply room={room} replyEventId={replyDraft.eventId} />
                      </Box>
                      <IconButton
                        variant="SurfaceVariant"
                        size="300"
                        radii="300"
                        style={{ background: 'transparent' }}
                        title={
                          silentReply ? 'Unmute reply notifications' : 'Mute reply notifications'
                        }
                        aria-pressed={silentReply}
                        aria-label={
                          silentReply ? 'Unmute reply notifications' : 'Mute reply notifications'
                        }
                        onClick={() => setSilentReply(!silentReply)}
                      >
                        {!silentReply && composerIcon(Bell)}
                        {silentReply && composerIcon(BellSlash)}
                      </IconButton>
                    </Box>
                  </Box>
                </div>
              )}
            </>
          }
          before={
            <>
              {isMobileOrTablet() ? (
                <>
                  <IconButton
                    onClick={() => {
                      attachmentSkipReturnFocusRef.current = true;
                      const activeElement = document.activeElement;
                      if (activeElement instanceof HTMLElement) activeElement.blur();
                      setShowAttachmentSheet(true);
                    }}
                    onPointerDown={suppressEditorRefocus}
                    variant="SurfaceVariant"
                    size="300"
                    radii="300"
                    style={{ backgroundColor: 'transparent' }}
                    title="Add"
                    aria-label="Add new Item"
                  >
                    {composerIcon(PlusCircle)}
                  </IconButton>
                  {showAttachmentSheet && (
                    <MobileSwipeDownModal
                      requestClose={() => setShowAttachmentSheet(false)}
                      containerRef={fileDropContainerRef}
                      focusTrap
                      dialogLabel="Share"
                      skipReturnFocusRef={attachmentSkipReturnFocusRef}
                    >
                      {() => (
                        <AttachmentContent
                          onPickPhotos={() => {
                            void pickAttachment('media', 'image/*,video/*,.tgs');
                          }}
                          onPickFile={() => {
                            void pickAttachment('document', '*');
                          }}
                          onPickPoll={() => {
                            setShowPollPicker(true);
                          }}
                          onPickLocation={() => {
                            setShowLocationPicker(true);
                          }}
                          skipReturnFocusRef={attachmentSkipReturnFocusRef}
                        />
                      )}
                    </MobileSwipeDownModal>
                  )}
                </>
              ) : (
                <>
                  <PopOut
                    anchor={AddMenuAnchor}
                    position="Top"
                    align="Start"
                    offset={5}
                    content={
                      <FocusTrap
                        focusTrapOptions={{
                          initialFocus: false,
                          onDeactivate: () => setAddMenuAnchor(undefined),
                          clickOutsideDeactivates: true,
                          escapeDeactivates: stopPropagation,
                        }}
                      >
                        <Menu>
                          <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                            <MenuItem
                              size="300"
                              radii="300"
                              onClick={() => {
                                setAddMenuAnchor(undefined);
                                setShowPollPicker(true);
                              }}
                              before={menuIcon(ListBullets)}
                            >
                              <Text size="B300">Create Poll</Text>
                            </MenuItem>
                            <MenuItem
                              size="300"
                              radii="300"
                              onClick={() => {
                                setAddMenuAnchor(undefined);
                                setShowLocationPicker(true);
                              }}
                              before={menuIcon(MapPinPlusIcon)}
                            >
                              <Text size="B300">Add Location</Text>
                            </MenuItem>
                            <MenuItem
                              size="300"
                              radii="300"
                              onClick={() => {
                                pickFile('*');
                                setAddMenuAnchor(undefined);
                              }}
                              before={menuIcon(PlusCircle)}
                            >
                              <Text size="B300">Add File</Text>
                            </MenuItem>
                          </Box>
                        </Menu>
                      </FocusTrap>
                    }
                  />
                  <IconButton
                    onClick={(evt) =>
                      editorOldAddFile
                        ? pickFile('*')
                        : setAddMenuAnchor(evt.currentTarget.getBoundingClientRect())
                    }
                    onPointerDown={suppressEditorRefocus}
                    variant="SurfaceVariant"
                    size="300"
                    radii="300"
                    style={{ backgroundColor: 'transparent' }}
                    title={editorOldAddFile ? 'Upload File' : 'Add'}
                    aria-label={editorOldAddFile ? 'Upload and attach a File' : 'Add new Item'}
                  >
                    {composerIcon(PlusCircle)}
                  </IconButton>
                </>
              )}
              {pmpPickerEnable && (isMobileOrTablet() ? !editingEvent : true) && (
                <PersonaPicker
                  tab={personaPickerTab}
                  mx={mx}
                  roomId={roomId}
                  suppressEditorRefocus={suppressEditorRefocus}
                  onTabChange={setPersonaPickerTab}
                  latchedPersona={latchedPersona}
                />
              )}
            </>
          }
          after={
            <>
              <UseStateProvider initial={undefined}>
                {() => {
                  const emojiBoard = (
                    <EmojiBoard
                      tab={emojiBoardTab}
                      onTabChange={setEmojiBoardTab}
                      imagePackRooms={imagePackRooms}
                      returnFocusOnDeactivate={false}
                      isFullWidth={isMobileOrTablet()}
                      sheet={isMobileOrTablet()}
                      onEmojiSelect={handleEmoticonSelect}
                      onCustomEmojiSelect={handleEmoticonSelect}
                      onStickerSelect={handleStickerSelect}
                      onGifSelect={handleGifSelect}
                      initialGifSearch={initialGifSearch}
                      requestClose={closeEmojiBoard}
                    />
                  );
                  // Mobile has no room for three triggers next to text.
                  const onlyEmojiTrigger = isMobile && hasText;
                  const triggers = (
                    <>
                      {editorButtonOrder.map((id) => {
                        let button: ReactElement | null = null;
                        if (id === 'gif' && editorGifButton && !onlyEmojiTrigger) {
                          button = (
                            <IconButton
                              ref={gifBtnRef}
                              aria-pressed={emojiBoardTab === EmojiBoardTab.Gif}
                              onClick={() => toggleEmojiBoardTab(EmojiBoardTab.Gif)}
                              onPointerDown={suppressEditorRefocus}
                              variant="SurfaceVariant"
                              size="300"
                              radii="300"
                              style={{ backgroundColor: 'transparent' }}
                              title="open gif picker"
                              aria-label="Open gif picker"
                            >
                              {composerIcon(Gif, {
                                weight: emojiBoardTab === EmojiBoardTab.Gif ? 'fill' : 'regular',
                              })}
                            </IconButton>
                          );
                        } else if (id === 'sticker' && editorStickerButton && !onlyEmojiTrigger) {
                          button = (
                            <IconButton
                              ref={stickerBtnRef}
                              aria-pressed={emojiBoardTab === EmojiBoardTab.Sticker}
                              onClick={() => toggleEmojiBoardTab(EmojiBoardTab.Sticker)}
                              onPointerDown={suppressEditorRefocus}
                              variant="SurfaceVariant"
                              size="300"
                              radii="300"
                              style={{ backgroundColor: 'transparent' }}
                              title="open sticker picker"
                              aria-label="Open sticker picker"
                            >
                              {composerIcon(Sticker, {
                                weight:
                                  emojiBoardTab === EmojiBoardTab.Sticker ? 'fill' : 'regular',
                              })}
                            </IconButton>
                          );
                        } else if (id === 'emoji' && editorEmojiButton) {
                          button = (
                            <IconButton
                              ref={emojiBtnRef}
                              aria-pressed={emojiBoardTab === EmojiBoardTab.Emoji}
                              onClick={() => toggleEmojiBoardTab(EmojiBoardTab.Emoji)}
                              onPointerDown={suppressEditorRefocus}
                              variant="SurfaceVariant"
                              size="300"
                              radii="300"
                              style={{ backgroundColor: 'transparent' }}
                              title="open emoji board"
                              aria-label="Open emoji board"
                            >
                              {composerIcon(Smiley, {
                                weight: emojiBoardTab === EmojiBoardTab.Emoji ? 'fill' : 'regular',
                              })}
                            </IconButton>
                          );
                        }
                        return <Fragment key={id}>{button}</Fragment>;
                      })}
                    </>
                  );
                  if (isMobileOrTablet()) {
                    return (
                      <>
                        {triggers}
                        {emojiBoardTab !== undefined && (
                          <MobileSwipeDownModal
                            requestClose={closeEmojiBoard}
                            focusTrap
                            dialogLabel="Emoji picker"
                            sheetClassName={messageCss.MessageMobileOptionsContainerPicker}
                            skipReturnFocusRef={emojiBoardSkipReturnFocusRef}
                          >
                            {() => emojiBoard}
                          </MobileSwipeDownModal>
                        )}
                      </>
                    );
                  }
                  return (
                    <PopOut
                      offset={16}
                      alignOffset={-44}
                      position="Top"
                      align="End"
                      anchor={(() => {
                        if (emojiBoardTab === undefined) return undefined;
                        const buttonRefs: Record<
                          EditorButtonId,
                          RefObject<HTMLButtonElement | null>
                        > = {
                          gif: gifBtnRef,
                          sticker: stickerBtnRef,
                          emoji: emojiBtnRef,
                        };
                        for (let i = editorButtonOrder.length - 1; i >= 0; i--) {
                          const id = editorButtonOrder[i];
                          if (!id) continue;
                          const btnRef = buttonRefs[id];
                          if (btnRef?.current) {
                            return btnRef.current.getBoundingClientRect();
                          }
                        }
                        return undefined;
                      })()}
                      content={emojiBoard}
                    >
                      {triggers}
                    </PopOut>
                  );
                }}
              </UseStateProvider>

              <MarkdownFormattingToolbarToggle variant="SurfaceVariant" />

              <IconButton
                ref={micBtnRef}
                variant={
                  showAudioRecorder ? 'Critical' : scheduledTime ? 'Primary' : 'SurfaceVariant'
                }
                size="300"
                radii={hasContent || showAudioRecorder || !editorMicButton ? '0' : '300'}
                title={
                  showAudioRecorder
                    ? 'Stop recording'
                    : hasContent || !editorMicButton
                      ? 'Send Message'
                      : 'Record audio message'
                }
                aria-label={
                  showAudioRecorder
                    ? 'Stop recording'
                    : hasContent || !editorMicButton
                      ? 'Send your composed Message'
                      : 'Record audio message'
                }
                style={{ backgroundColor: 'transparent' }}
                aria-pressed={!hasContent && editorMicButton ? showAudioRecorder : undefined}
                onClick={() => {
                  if (showAudioRecorder) {
                    requestRecorderStop();
                    return;
                  }
                  if (hasContent) {
                    if (isLongPress.current) {
                      isLongPress.current = false;
                      return;
                    }
                    if (sentOnPointerUpRef.current) return;
                    submit().catch((error) => log.error('submit failed', { roomId }, error));
                    return;
                  }
                  if (!editorMicButton) return;
                  if (isMobileOrTablet()) return;
                  recorderActionRef.current = undefined;
                  setShowAudioRecorder(true);
                }}
                onMouseDown={(e: MouseEvent) => {
                  if (hasContent) e.preventDefault();
                }}
                onPointerDown={() => {
                  sentOnPointerUpRef.current = false;
                  if (showAudioRecorder) return;
                  if (hasContent) {
                    isLongPress.current = false;
                    if (isMobileOrTablet() && delayedEventsSupported && !threadRootId) {
                      longPressTimer.current = setTimeout(() => {
                        isLongPress.current = true;
                        setShowSchedulePicker(true);
                      }, 1000);
                    }
                    return;
                  }
                  if (!editorMicButton) return;
                  if (!isMobileOrTablet()) return;
                  recorderActionRef.current = undefined;
                  micHoldStartRef.current = Date.now();
                  setShowAudioRecorder(true);

                  function discardRecording() {
                    if (recorderActionRef.current) return;
                    recorderActionRef.current = 'cancel';
                    releaseListeners();
                    scheduleRecorderTimer(() => {
                      audioRecorderRef.current?.cancel();
                    });
                  }
                  function onUp() {
                    if (recorderActionRef.current) return;
                    const held = Date.now() - micHoldStartRef.current;
                    if (held >= HOLD_THRESHOLD_MS) {
                      recorderActionRef.current = 'stop';
                      releaseListeners();
                      scheduleRecorderTimer(() => {
                        audioRecorderRef.current?.stop();
                      });
                    } else {
                      discardRecording();
                    }
                  }
                  function releaseListeners() {
                    micHoldReleaseRef.current = null;
                    window.removeEventListener('pointerup', onUp);
                    window.removeEventListener('pointercancel', discardRecording);
                  }
                  micHoldReleaseRef.current = releaseListeners;
                  window.addEventListener('pointerup', onUp);
                  window.addEventListener('pointercancel', discardRecording);
                }}
                onPointerUp={(evt: PointerEvent<HTMLButtonElement>) => {
                  if (longPressTimer.current !== null) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                  }
                  // iOS drops the synthesized click when the page mutates during a tap.
                  if (evt.pointerType === 'mouse') return;
                  if (showAudioRecorder || !hasContent || isLongPress.current) return;
                  // Touch implicitly captures the pointer, so a release off the button lands here too.
                  const rect = evt.currentTarget.getBoundingClientRect();
                  if (
                    evt.clientX < rect.left ||
                    evt.clientX > rect.right ||
                    evt.clientY < rect.top ||
                    evt.clientY > rect.bottom
                  ) {
                    return;
                  }
                  sentOnPointerUpRef.current = true;
                  submit().catch((error) => log.error('submit failed', { roomId }, error));
                }}
                onPointerCancel={() => {
                  if (longPressTimer.current !== null) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                  }
                }}
                disabled={sendBusy && !showAudioRecorder}
                className={
                  hasContent && delayedEventsSupported && !threadRootId
                    ? css.SplitSendButton
                    : undefined
                }
              >
                {showAudioRecorder ? (
                  <Stop
                    size={getPhosphorIconSize('toolbar')}
                    weight="fill"
                    style={{ color: color.Critical.Main }}
                  />
                ) : sendBusy ? (
                  <Spinner size="300" variant="Secondary" />
                ) : hasContent || !editorMicButton ? (
                  scheduledTime ? (
                    composerIcon(Clock)
                  ) : (
                    composerIcon(PaperPlaneTilt)
                  )
                ) : (
                  composerIcon(Microphone)
                )}
              </IconButton>
              <PopOut
                anchor={scheduleMenuAnchor}
                position="Top"
                align="End"
                offset={5}
                content={
                  <FocusTrap
                    focusTrapOptions={{
                      initialFocus: false,
                      onDeactivate: () => setScheduleMenuAnchor(undefined),
                      clickOutsideDeactivates: true,
                      escapeDeactivates: stopPropagation,
                    }}
                  >
                    <Menu>
                      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                        <MenuItem
                          size="300"
                          radii="300"
                          onClick={() => {
                            setScheduleMenuAnchor(undefined);
                            submit();
                          }}
                          before={menuIcon(PaperPlaneTilt)}
                        >
                          <Text size="B300">Send Now</Text>
                        </MenuItem>
                        <MenuItem
                          size="300"
                          radii="300"
                          onClick={() => {
                            setScheduleMenuAnchor(undefined);
                            setShowSchedulePicker(true);
                          }}
                          before={menuIcon(Clock)}
                        >
                          <Text size="B300">Schedule Send</Text>
                        </MenuItem>
                      </Box>
                    </Menu>
                  </FocusTrap>
                }
              />
              {delayedEventsSupported && !isMobileOrTablet() && !threadRootId && (
                <IconButton
                  onClick={(evt: MouseEvent<HTMLButtonElement>) => {
                    setScheduleMenuAnchor(evt.currentTarget.getBoundingClientRect());
                  }}
                  title="Schedule Message"
                  aria-label="Schedule message send"
                  variant={scheduledTime ? 'Primary' : 'SurfaceVariant'}
                  style={{ backgroundColor: 'transparent' }}
                  size="300"
                  radii="0"
                  className={css.SplitChevronButton}
                >
                  {chipIcon(CaretDown)}
                </IconButton>
              )}
            </>
          }
          bottom={<MarkdownFormattingToolbarBottom controller={editor} />}
        />
        {showSchedulePicker && !threadRootId && (
          <SchedulePickerDialog
            initialTime={scheduledTime?.getTime()}
            showEncryptionWarning={isEncrypted}
            onCancel={() => setShowSchedulePicker(false)}
            onSubmit={(date) => {
              setScheduledTime(date);
              setShowSchedulePicker(false);
              setSendError(undefined);
            }}
          />
        )}
        {showPollPicker && (
          <PollDialog
            onCancel={() => setShowPollPicker(false)}
            onSubmit={(content) =>
              handleDialogSendContent(content, M_POLL_START.name as keyof TimelineEvents)
            }
          />
        )}
        {showLocationPicker && (
          <Suspense fallback={null}>
            <LocationDialog
              onCancel={() => setShowLocationPicker(false)}
              room={room}
              onSubmit={handleDialogSendContent}
            />
          </Suspense>
        )}
      </div>
    );
  }
);
