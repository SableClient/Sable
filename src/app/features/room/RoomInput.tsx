import type {KeyboardEventHandler, MouseEvent, ReactElement, RefObject} from 'react';
import {forwardRef, Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState,} from 'react';
import {useAtom, useAtomValue, useSetAtom} from 'jotai';

import {isKeyHotkey} from 'is-hotkey';
import type {
  IContent,
  IEventRelation,
  MatrixEvent,
  Room,
  RoomMessageEventContent,
  StickerEventContent,
} from '$types/matrix-sdk';
import {EventType, MatrixError, MsgType, RelationType} from '$types/matrix-sdk';
import {ReactEditor} from 'slate-react';
import {Editor, Point, Range, Transforms} from 'slate';
import {
  Box,
  color,
  config,
  Dialog,
  IconButton,
  Menu,
  MenuItem,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  PopOut,
  RectCords,
  Scroll,
  Spinner,
  Switch,
  Text,
  toRem
} from 'folds';

import {useMatrixClient} from '$hooks/useMatrixClient';
import type {AutocompleteQuery} from '$components/editor';
import {
  ANYWHERE_AUTOCOMPLETE_PREFIXES,
  AutocompletePrefix,
  BEGINNING_AUTOCOMPLETE_PREFIXES,
  BlockType,
  createEmoticonElement,
  CustomEditor,
  customHtmlEqualsPlainText,
  EmoticonAutocomplete,
  focusEditor,
  getAutocompleteQuery,
  getBeginCommand,
  getLinks,
  getMentions,
  getPrevWorldRange,
  isEmptyEditor,
  MarkdownFormattingToolbarBottom,
  MarkdownFormattingToolbarToggle,
  moveCursor,
  replaceWithElement,
  resetEditor,
  resetEditorHistory,
  RoomMentionAutocomplete,
  toMatrixCustomHTML,
  toPlainText,
  trimCommand,
  trimCustomHtml,
  UserMentionAutocomplete,
} from '$components/editor';
import {stripMarkdownEscapesForHiddenPreviews} from './message/hiddenLinkPreviews';
import {plainToEditorInput} from '$components/editor/input';
import type {GifData} from '$components/emoji-board';
import {EmojiBoard, EmojiBoardTab} from '$components/emoji-board';
import {UseStateProvider} from '$components/UseStateProvider';
import type {TUploadContent} from '$utils/matrix';
import {cancelUploadContent, encryptFile, getImageInfo, mxcUrlToHttp, toggleReaction,} from '$utils/matrix';
import {useTypingStatusUpdater} from '$hooks/useTypingStatusUpdater';
import {useFilePicker} from '$hooks/useFilePicker';
import {useFilePasteHandler} from '$hooks/useFilePasteHandler';
import {useFileDropZone} from '$hooks/useFileDrop';
import {
  IReplyDraft,
  roomEmbedAtomFamily,
  roomIdToEmbeddItemsAtomFamily,
  roomIdToMsgDraftAtomFamily,
  roomIdToReplyDraftAtomFamily,
  roomIdToUploadItemsAtomFamily,
  roomUploadAtomFamily,
  TEmbeddItem,
  TUploadItem,
  TUploadMetadata
} from '$state/room/roomInputDrafts';
import {EmbedCardRenderer, UploadCard, UploadCardRenderer} from '$components/upload-card';
import type {UploadBoardImperativeHandlers} from '$components/upload-board';
import {UploadBoard, UploadBoardContent, UploadBoardHeader} from '$components/upload-board';
import type {Upload, UploadSuccess} from '$state/upload';
import {createUploadFamilyObserverAtom, UploadStatus} from '$state/upload';
import {loadImageElementFromMediaUrl} from '$utils/dom';
import {isImageMimeType, safeUploadFile} from '$utils/mimeTypes';
import {fulfilledPromiseSettledResult} from '$utils/common';
import {useSetting} from '$state/hooks/settings';
import type {EditorButtonId} from '$state/settings';
import {settingsAtom} from '$state/settings';
import {matchesShortcut} from '../../keyboard/shortcuts';
import {getEditedEvent, getMentionContent, getThreadReplyEvents} from '$utils/room/relations';
import {buildReplacementContent} from './buildReplacementContent';
import {htmlToMarkdown} from '$plugins/markdown';
import {Command, SHRUG, TABLEFLIP, UNFLIP, useCommands} from '$hooks/useCommands';
import {isMobileOrTablet} from '$utils/platform';
import {Reply, ThreadIndicator} from '$components/message';
import {roomToParentsAtom} from '$state/room/roomToParents';
import {nicknamesAtom} from '$state/nicknames';
import {useMediaAuthentication} from '$hooks/useMediaAuthentication';
import {useImagePackRooms} from '$hooks/useImagePackRooms';
import {useComposingCheck} from '$hooks/useComposingCheck';
import {createLogger} from '$utils/debug';
import {createDebugLogger} from '$utils/debugLogger';
import FocusTrap from 'focus-trap-react';
import {useQueryClient} from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import {
  delayedEventsSupportedAtom,
  roomIdToEditingScheduledDelayIdAtomFamily,
  roomIdToScheduledTimeAtomFamily,
  serverMaxDelayMsAtom,
} from '$state/scheduledMessages';
import {cancelDelayedEvent, computeDelayMs, sendDelayedMessage, sendDelayedMessageE2EE,} from '$utils/delayedEvents';
import {daysToMs, timeDayMonthYear, timeHourMinute} from '$utils/time';
import {stopPropagation} from '$utils/keyboard';

import {usePowerLevelsContext} from '$hooks/usePowerLevels';
import {useRoomCreators} from '$hooks/useRoomCreators';
import {useRoomPermissions} from '$hooks/useRoomPermissions';
import {AutocompleteNotice} from '$components/editor/autocomplete/AutocompleteNotice';
import {
  convertPerMessageProfileToBeeperFormat,
  getCurrentlyUsedPerMessageProfileForAccount,
  getCurrentlyUsedPerMessageProfileForRoom,
  type PerMessageProfileMsc4461,
  setCurrentlyUsedPerMessageProfileIdForRoom,
  stripPerMessageProfileFormattedBody,
} from '$hooks/usePerMessageProfile';
import {
  Bell,
  BellSlash,
  CaretDown,
  chipIcon,
  Clock,
  composerIcon,
  dropzoneIcon,
  File as FileIcon,
  getPhosphorIconSize,
  Gif,
  Image as ImageIcon,
  ListBullets,
  MapPinPlusIcon,
  menuIcon,
  Microphone,
  PaperPlaneTilt,
  PencilSimple,
  PlusCircle,
  sizedIcon,
  Smiley,
  Sticker,
  Stop,
  X,
} from '$components/icons/phosphor';
import {getSupportedAudioExtension} from '$plugins/voice-recorder-kit/supportedCodec';
import {ErrorCode} from '../../cs-errorcode';
import {sanitizeText} from '$utils/sanitize';
import {PKitCommandMessageHandler} from '$plugins/pluralkit-handler/PKitCommandMessageHandler';
import {PKitProxyMessageHandler} from '$plugins/pluralkit-handler/PKitProxyMessageHandler';
import type {IGenericMSC4459, MSC4459ImagePackReference} from '$types/matrix/common';
import {getImagePackReferencesForMxc, getImagePackReferencesForMxcWrappedInMap,} from '$utils/msc4459helper';
import {ImageUsage} from '$plugins/custom-emoji';
import {getPackImageInfo} from '$plugins/custom-emoji/utils';
import {SerializableMap} from '$types/wrapper/SerializableMap';
import {useSettingsLinkBaseUrl} from '$features/settings/useSettingsLinkBaseUrl';
import * as messageCss from '$features/room/message/styles.css';
import {AttachmentContent} from '$components/attachment-sheet/AttachmentContent';
import {MobileSwipeDownModal} from '$components/MobileSwipeDownModal';
import {SchedulePickerDialog} from './schedule-send';
import * as css from './schedule-send/SchedulePickerDialog.css';
import {
  buildGalleryContent,
  getAudioMsgContent,
  getFileMsgContent,
  getGalleryItemContent,
  getGifMsgContent,
  getImageMsgContent,
  getVideoMsgContent,
} from './msgContent';
import {outgoingMessageTransforms} from './outgoingMessageTransforms';
import {getSendableKlipyMxcUrl} from '$utils/klipy';
import {CommandAutocomplete} from './CommandAutocomplete';
import type {AudioMessageRecorderHandle, AudioRecordingCompletePayload,} from './AudioMessageRecorder';
import {AudioMessageRecorder} from './AudioMessageRecorder';
import * as prefix from '$unstable/prefixes';
import {PollDialog} from './poll-modals';
import {useClientConfig} from '$hooks/useClientConfig';
import {PersistentPersonaPicker, type PersonaPickerTab} from './persona-picker/PersonaPicker.tsx';
import {createEmbedFamilyObserverAtom, EmbedStatus, FixedPreviewUrlResponse} from "$state/bundle.ts";

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

interface RoomInputProps {
  editor: Editor;
  fileDropContainerRef: RefObject<HTMLElement>;
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
    const clientConfig = useClientConfig();
    const useAuthentication = useMediaAuthentication();
    const [enterForNewline] = useSetting(settingsAtom, 'enterForNewline');
    const [editorOldAddFile] = useSetting(settingsAtom, 'editorOldAddFile');
    const [editorGifButton] = useSetting(settingsAtom, 'editorGifButton');
    const [editorEmojiButton] = useSetting(settingsAtom, 'editorEmojiButton');
    const [editorStickerButton] = useSetting(settingsAtom, 'editorStickerButton');
    const [editorMicButton] = useSetting(settingsAtom, 'editorMicButton');
    const [editorButtonOrder] = useSetting(settingsAtom, 'editorButtonOrder');
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
    const pluralkitProxyMessageHandler = useMemo(() => new PKitProxyMessageHandler(mx), [mx]);
    useEffect(() => {
      pluralkitProxyMessageHandler.init();
    }, [pluralkitProxyMessageHandler]);

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


    const [embedLinks, setEmbedLinks] = useAtom(roomIdToEmbeddItemsAtomFamily(draftKey));
    const [embedsEnabled, setEmbedsEnabled] = useState(false);
    const embedobserver = createEmbedFamilyObserverAtom(roomEmbedAtomFamily, embedLinks.map(e => e.url));
    const embeds = useAtomValue(embedobserver);

    const [uploadBoard, setUploadBoard] = useState(true);
    const [uploadSending, setUploadSending] = useState(false);
    const [uploadBusy, setUploadBusy] = useState(false);
    const [selectedFiles, setSelectedFiles] = useAtom(roomIdToUploadItemsAtomFamily(draftKey));
    const isEncrypting = selectedFiles.some((f) => f.encrypting);
    const sendBusy = uploadSending || isEncrypting || uploadBusy;
    const uploadFamilyObserverAtom = createUploadFamilyObserverAtom(
      roomUploadAtomFamily,
      selectedFiles.map((f) => f.file)
    );
    const uploadBoardHandlers = useRef<UploadBoardImperativeHandlers>();
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLongPress = useRef(false);
    const suppressBlurRefocusRef = useRef(false);
    const suppressEditorRefocus = useCallback(() => {
      suppressBlurRefocusRef.current = true;
      requestAnimationFrame(() => {
        suppressBlurRefocusRef.current = false;
      });
    }, []);

    const imagePackRooms: Room[] = useImagePackRooms(roomId, roomToParents);

    const [showAudioRecorder, setShowAudioRecorder] = useState(false);
    const audioRecorderRef = useRef<AudioMessageRecorderHandle>(null);
    const micHoldStartRef = useRef(0);
    const micHoldReleaseRef = useRef<(() => void) | null>(null);
    const HOLD_THRESHOLD_MS = 400;

    useEffect(
      () => () => {
        micHoldReleaseRef.current?.();
      },
      []
    );
    const [autocompleteQuery, setAutocompleteQuery] =
      useState<AutocompleteQuery<AutocompletePrefix>>();
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

    const [inputKey, setInputKey] = useState(0);
    const getUploadItemKey = useCallback((fileItem: TUploadItem): string => {
      const existingKey = uploadItemKeysRef.current.get(fileItem.originalFile);
      if (existingKey) return existingKey;

      const nextKey = createUploadItemKey();
      uploadItemKeysRef.current.set(fileItem.originalFile, nextKey);
      return nextKey;
    }, []);

    const handleFiles = useCallback(
      async (files: File[], audioMeta?: { waveform: number[]; audioDuration: number }) => {
        setUploadBoard(true);
        const safeFiles = await Promise.all(files.map(safeUploadFile));
        // Eager-read to avoid Android content URI expiry after SAF picker
        const blobbedFiles = isMobileOrTablet()
          ? await Promise.all(
              safeFiles.map(async (f) => {
                try {
                  const buf = await f.arrayBuffer();
                  return new File([buf], f.name, { type: f.type, lastModified: f.lastModified });
                } catch {
                  return f;
                }
              })
            )
          : safeFiles;
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
          placeholders.forEach((placeholder) => {
            encryptFile(placeholder.originalFile)
              .then((ef) =>
                setSelectedFiles({
                  type: 'REPLACE',
                  item: placeholder,
                  replacement: { ...ef, encrypting: false, metadata: placeholder.metadata },
                })
              )
              .catch((encryptError: unknown) => {
                log.warn('Failed to encrypt file for upload:', encryptError);
                setSelectedFiles({ type: 'DELETE', item: placeholder });
              });
          });
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
      },
      [setSelectedFiles, room]
    );
    const pickFile = useFilePicker(handleFiles, true);
    const handlePaste = useFilePasteHandler(handleFiles);
    const dropZoneVisible = useFileDropZone(fileDropContainerRef, handleFiles);
    const [hasText, setHasText] = useState(false);
    const lastEncryptionPreparationAt = useRef(0);
    const handleEditorChange = useCallback(() => {
      setHasText(!isEmptyEditor(editor));
      checkForEmbedables(Editor.string(editor, []));
      if (!room.hasEncryptionStateEvent()) return;

      const now = Date.now();
      if (now - lastEncryptionPreparationAt.current < ENCRYPTION_PREPARATION_INTERVAL_MS) return;

      lastEncryptionPreparationAt.current = now;
      mx.getCrypto()?.prepareToEncrypt(room);
    }, [editor, mx, room]);
    const hasContent = hasText || selectedFiles.length > 0;

    const isComposing = useComposingCheck();

    const queryClient = useQueryClient();
    const delayedEventsSupported = useAtomValue(delayedEventsSupportedAtom);
    const [scheduledTime, setScheduledTime] = useAtom(roomIdToScheduledTimeAtomFamily(roomId));
    const [editingScheduledDelayId, setEditingScheduledDelayId] = useAtom(
      roomIdToEditingScheduledDelayIdAtomFamily(roomId)
    );
    const [AddMenuAnchor, setAddMenuAnchor] = useState<RectCords>();
    const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
    const attachmentSkipReturnFocusRef = useRef(false);
    const [showPollPicker, setShowPollPicker] = useState(false);
    const [showLocationPicker, setShowLocationPicker] = useState(false);
    const [scheduleMenuAnchor, setScheduleMenuAnchor] = useState<RectCords>();
    const [showSchedulePicker, setShowSchedulePicker] = useState(false);
    const [silentReply, setSilentReply] = useState(!mentionInReplies);
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
        if (prev !== tab) return tab;
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

    useEffect(() => {
      Transforms.insertFragment(editor, msgDraft);
    }, [editor, msgDraft]);

    useEffect(
      () => () => {
        if (isEmptyEditor(editor)) {
          setMsgDraft([]);
        } else {
          const parsedDraft = structuredClone(editor.children);
          setMsgDraft(parsedDraft);
        }
        resetEditor(editor);
        resetEditorHistory(editor);
      },
      [draftKey, editor, setMsgDraft]
    );

    const editingEvent = editId ? room.findEventById(editId) : undefined;
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

    const prevEditingEventId = useRef<string>();
    const preEditDraftRef = useRef<Editor['children']>();
    useEffect(() => {
      if (!isMobileOrTablet()) {
        prevEditingEventId.current = undefined;
        preEditDraftRef.current = undefined;
        return;
      }

      if (editingEvent) {
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
            ? stripPerMessageProfileFormattedBody(customHtml ?? '')
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

          resetEditor(editor);
          resetEditorHistory(editor);
          Transforms.insertFragment(editor, initialValue);

          requestAnimationFrame(() => {
            try {
              ReactEditor.focus(editor);
              moveCursor(editor);
            } catch {
              // Ignore focus error
            }
          });
        }
      } else {
        const previousDraft = preEditDraftRef.current;
        if (prevEditingEventId.current && previousDraft) {
          resetEditor(editor);
          resetEditorHistory(editor);
          Transforms.insertFragment(editor, previousDraft);
        }
        preEditDraftRef.current = undefined;
        if (
          prevEditingEventId.current &&
          (!replyDraft?.eventId || replyDraft.eventId === threadRootId)
        ) {
          requestAnimationFrame(() => {
            try {
              const domNode = ReactEditor.toDOMNode(editor, editor);
              domNode.blur();
              (document.activeElement as HTMLElement)?.blur();
            } catch {
              // Ignore blur error
            }
          });
        }
        prevEditingEventId.current = undefined;
      }
    }, [
      editingEvent,
      editor,
      getEditingContent,
      mx,
      nicknames,
      room,
      replyDraft?.eventId,
      threadRootId,
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
          requestAnimationFrame(() => {
            try {
              ReactEditor.focus(editor);
              moveCursor(editor);
            } catch {
              // Ignore focus errors
            }
          });
        } else if (!newId && prevId && prevId !== threadRootId && !editId) {
          requestAnimationFrame(() => {
            try {
              const domNode = ReactEditor.toDOMNode(editor, editor);
              domNode.blur();
              (document.activeElement as HTMLElement)?.blur();
            } catch {
              // Ignore blur errors
            }
          });
        }
      }
    }, [replyDraft?.eventId, threadRootId, editId, editor]);

    const handleFileMetadata = useCallback(
      (fileItem: TUploadItem, metadata: TUploadMetadata) => {
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
        uploads.forEach((u) => roomUploadAtomFamily.remove(u));
      },
      [setSelectedFiles, selectedFiles]
    );

    const handleAudioRecordingComplete = useCallback(
      (payload: AudioRecordingCompletePayload) => {
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
        onRequestClose={() => setShowAudioRecorder(false)}
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

    const handleSendContents = async (contents: IContent[]) => {
      const plainText = toPlainText(editor.children).trim();

      /**
       * the currently with the room associated per-message profile, if any, so that it can be included in the message content when sending.
       * This allows the server to apply the correct profile-based transformations (e.g. font size adjustments) when processing the message,
       * and also allows clients to display an accurate preview of how the message will look with the profile applied while it's being composed.
       */
      const globalPerMessageProfile = await getCurrentlyUsedPerMessageProfileForAccount(mx);
      const roomPerMessageProfile = await getCurrentlyUsedPerMessageProfileForRoom(mx, roomId);
      const perMessageProfile = roomPerMessageProfile ?? globalPerMessageProfile;

      if (perMessageProfile) {
        contents.forEach((c) => {
          // We intentionally mutate the objects here to avoid unnecessary copying
          // mutating should be unproblematic here, since contents isn't a react component,
          // or used for rendering
          c[prefix.MATRIX_UNSTABLE_PER_MESSAGE_PROFILE_PROPERTY_NAME] =
            convertPerMessageProfileToBeeperFormat(perMessageProfile, false);
        });
      }

      if (contents.length > 0) {
        const replyContent =
          plainText?.length === 0 ? getReplyContent(replyDraft, room) : undefined;
        if (replyContent) {
          contents[0]!['m.relates_to'] = replyContent;
          if (!silentReply && replyDraft)
            contents[0]!['m.mentions'] = { ['user_ids']: [replyDraft.userId] };
          setReplyDraft(replyDraftBase);
        }
      }

      const invalidate = () =>
        queryClient.invalidateQueries({ queryKey: ['delayedEvents', roomId] });

      if (scheduledTime) {
        try {
          const delayMs = computeDelayMs(scheduledTime);
          if (editingScheduledDelayId) {
            await cancelDelayedEvent(mx, editingScheduledDelayId);
          }

          await Promise.all(
            contents.map((content) => {
              if (isEncrypted) {
                return sendDelayedMessageE2EE(mx, roomId, room, content, delayMs);
              }
              return sendDelayedMessage(mx, roomId, content, delayMs);
            })
          );

          invalidate();
          setEditingScheduledDelayId(null);
          setScheduledTime(null);
        } catch (error) {
          debugLog.error('message', 'Failed to schedule message', {
            roomId,
            error: error instanceof Error ? error.message : String(error),
          });
          log.error('failed to schedule message', { roomId }, error);
          throw error;
        }
      } else {
        if (editingScheduledDelayId) {
          try {
            await cancelDelayedEvent(mx, editingScheduledDelayId);
            invalidate();
            setEditingScheduledDelayId(null);
          } catch {
            debugLog.error('message', 'Failed to cancel scheduled event before immediate send', {
              roomId,
            });
          }
        }

        await Promise.all(
          contents.map((content) =>
            mx
              .sendMessage(roomId, threadRootId ?? null, content as RoomMessageEventContent)
              .then((res: { event_id: string }) => {
                debugLog.info('message', 'Message sent', {
                  roomId,
                  eventId: res.event_id,
                  msgtype: content.msgtype,
                });
                return res;
              })
              .catch((error: unknown) => {
                debugLog.error('message', 'Failed to send message', {
                  roomId,
                  error: error instanceof Error ? error.message : String(error),
                });
                log.error('failed to send message', { roomId }, error);
                throw error;
              })
          )
        );
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

    const handleSendUpload = async (uploads: Upload[]) => {
      const plainText = toPlainText(editor.children).trim();
      const caption = plainText.length > 0 ? plainText : undefined;
      let customHtml = trimCustomHtml(
        toMatrixCustomHTML(editor.children, {
          stripNickname: true,
          room,
        })
      );
      const formattedCaption =
        caption && !customHtmlEqualsPlainText(customHtml, plainText) ? customHtml : undefined;

      const resolved = fulfilledPromiseSettledResult(
        await Promise.allSettled(
          uploads.map(async (upload): Promise<UploadSuccess> => {
            if (upload.status === UploadStatus.Success) return upload;
            if (upload.status === UploadStatus.Loading) {
              const response = await upload.promise;
              if (!response.content_uri) throw new Error('Upload failed');
              return { status: UploadStatus.Success, file: upload.file, mxc: response.content_uri };
            }
            throw new Error('Upload not ready');
          })
        )
      );
      if (resolved.length === 0) return;

      if (resolved.length == 1 && sendIndividualAttachmentAsCaption) {
        const upload = resolved[0];
        if (!upload) throw new Error('Broken upload');
        let content = await uploadToContent(upload);
        handleCancelUpload(resolved);

        content.body = caption ?? '';
        content.formatted_body = undefined;

        if (formattedCaption) {
          content.format = 'org.matrix.custom.html';
          content.formatted_body = formattedCaption;
        }

        await handleSendContents([content]);
        return;
      }
      if (resolved.length >= 2 && enableMediaGalleries) {
        const itemsPromises = resolved.map(async (upload) => {
          const fileItem = selectedFiles.find((f) => f.file === upload.file);
          if (!fileItem) throw new Error('Broken upload');
          return getGalleryItemContent(mx, fileItem, upload.mxc);
        });
        handleCancelUpload(resolved);
        const items = fulfilledPromiseSettledResult(await Promise.allSettled(itemsPromises));

        if (items.length === 0) return;

        const galleryContent = buildGalleryContent(items, caption, formattedCaption);

        await handleSendContents([galleryContent]);
        return;
      }
      const contentsPromises = resolved.map(uploadToContent);
      handleCancelUpload(resolved);
      const contents = fulfilledPromiseSettledResult(await Promise.allSettled(contentsPromises));

      await handleSendContents(contents);
    };


    const handleCloseAutocomplete = useCallback(() => {
      setAutocompleteQuery((prev) => {
        if (prev !== undefined) {
          focusEditor(editor);
        }
        return undefined;
      });
    }, [editor]);

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

        resetEditor(editor);
        resetEditorHistory(editor);
        sendTypingStatus(false);
        handleCloseAutocomplete();
      },
      [editor, handleCloseAutocomplete, mx, room, sendTypingStatus]
    );

    const submit = useCallback(async () => {
      if (editingEvent && isMobileOrTablet()) {
        let plainText = toPlainText(editor.children).trim();
        if (!plainText) {
          onCancelEdit?.();
          return;
        }

        let customHtml = trimCustomHtml(
          toMatrixCustomHTML(editor.children, {
            forEmote: editingEvent.getContent().msgtype === MsgType.Emote,
            room,
          })
        );
        const oldContent = editingEvent.getContent();
        const currentContent = getEditingContent(editingEvent);
        const eventId = editingEvent.getId();
        if (!eventId) return;

        const rawPmp =
          currentContent['com.beeper.per_message_profile'] ??
          oldContent['com.beeper.per_message_profile'];

        const mentionData = getMentions(mx, roomId, editor);
        const previousMentions = currentContent['m.mentions'];
        if (
          previousMentions &&
          typeof previousMentions === 'object' &&
          'user_ids' in previousMentions &&
          Array.isArray(previousMentions.user_ids)
        ) {
          previousMentions.user_ids.forEach((userId) => {
            if (typeof userId === 'string') mentionData.users.add(userId);
          });
        }
        const mMentions = getMentionContent(Array.from(mentionData.users), mentionData.room);

        const linkPreviews =
          getLinks(editor.children)?.map((matchedUrl) => ({
            matched_url: matchedUrl,
          })) ?? [];

        const content = buildReplacementContent(
          oldContent,
          plainText,
          customHtml,
          eventId,
          mMentions,
          linkPreviews,
          rawPmp,
          pmpNoFallback
        );

        await mx.sendMessage(roomId, content as RoomMessageEventContent);
        onCancelEdit?.();
        sendTypingStatus(false);
        return;
      }

      if (selectedFiles.some((f) => f.encrypting)) return;
      uploadBoardHandlers.current?.handleSend();
      if (
        (selectedFiles.length >= 2 && enableMediaGalleries) ||
        (selectedFiles.length == 1 && sendIndividualAttachmentAsCaption)
      ) {
        resetEditor(editor);
        resetEditorHistory(editor);
        sendTypingStatus(false);
        return;
      }



      const commandName = getBeginCommand(editor);
      /**
       * a map of regex patterns to replace nicknames with,
       * used when stripNickname is true in toMatrixCustomHTML
       * during HTML generation for the message content.
       * This is necessary because the HTML generation needs to know
       * which nicknames to strip in order to generate the correct formatted_body,
       * and the plain text generation needs to replace those same nicknames with
       * the original user IDs so that the message content remains consistent and
       * mentions are correctly processed by the server and clients.
       */
      const nicknameReplacement = new Map<RegExp, string>();
      if (replyEvent) {
        /**
         * the id of the user being replied to,
         * whose nickname (if any) should be stripped
         * from the message content and replaced with their
         * user ID for correct mention processing
         */
        const senderId = replyEvent.getSender();
        if (senderId) {
          const nick = nicknames[senderId];
          if (typeof nick === 'string' && nick.length > 0) {
            nicknameReplacement.set(
              new RegExp(`@?${nick}`, 'g'),
              room.getMember(senderId)?.rawDisplayName ?? senderId
            );
          }
        }
      }
      /**
       * any other users mentioned in the message being replied to,
       * whose nicknames should also be stripped and replaced with user IDs
       */
      const mentions = getMentions(mx, roomId, editor);
      if (mentions?.users) {
        mentions.users.forEach((id) => {
          const nick = nicknames[id];
          if (typeof nick === 'string' && nick.length > 0) {
            nicknameReplacement.set(
              new RegExp(`@?${nick}`, 'g'),
              room.getMember(id)?.rawDisplayName ?? id
            );
          }
        });
      }
      /**
       * the plain text we will send
       */
      let serializedChildren = editor.children;
      if (commandName) {
        // Strip the empty text node and command node from the beginning of the first paragraph
        const firstPara = serializedChildren[0];
        if (
          firstPara &&
          'type' in firstPara &&
          firstPara.type === BlockType.Paragraph &&
          firstPara.children.length >= 2
        ) {
          serializedChildren = [
            {
              ...firstPara,
              children: firstPara.children.slice(2),
            },
            ...serializedChildren.slice(1),
          ];
        }
      }
      const outgoingTransformContext = {
        isMarkdown: true,
        settingsLinkBaseUrl,
      };

      outgoingMessageTransforms.forEach((transform) => {
        if (!transform.shouldApply(serializedChildren, outgoingTransformContext)) return;
        serializedChildren = transform.apply(serializedChildren, outgoingTransformContext);
      });

      let plainText = toPlainText(serializedChildren, true, true, nicknameReplacement).trim();

      /**
       * the html we will send
       */
      let customHtml = trimCustomHtml(
        toMatrixCustomHTML(serializedChildren, {
          stripNickname: true,
          nickNameReplacement: nicknameReplacement,
          forEmote: commandName === Command.Me || commandName === Command.RainbowMe,
          room,
        })
      );
      const rawGifCommand =
        commandName === undefined ? plainText.match(/^\/gif(?:\s+(.*))?$/i) : undefined;

      let msgType = MsgType.Text;

      // quick text react
      if (canSendReaction && plainText.startsWith('+#')) {
        handleQuickReact(plainText.substring(2));
        return;
      }

      // check if its a pk command
      if (pkCompatEnable && PKitCommandMessageHandler.isPKCommand(plainText)) {
        await pluralkitCmdMessageHandler.handleMessage(plainText);
        resetEditor(editor); // clear the editor
        return; // don't do anything besides handling the command
      }

      if (rawGifCommand) {
        setInitialGifSearch(rawGifCommand[1] ?? '');
        setEmojiBoardTab(EmojiBoardTab.Gif);
        resetEditor(editor);
        resetEditorHistory(editor);
        sendTypingStatus(false);
        return;
      }

      if (commandName) {
        plainText = trimCommand(commandName, plainText);
        customHtml = trimCommand(commandName, customHtml);
      }
      if (commandName === Command.Me) {
        msgType = MsgType.Emote;
      } else if (commandName === Command.Notice) {
        msgType = MsgType.Notice;
      } else if (commandName === Command.Shrug) {
        plainText = `${SHRUG} ${plainText}`;
        customHtml = `${SHRUG} ${customHtml}`;
      } else if (commandName === Command.TableFlip) {
        plainText = `${TABLEFLIP} ${plainText}`;
        customHtml = `${TABLEFLIP} ${customHtml}`;
      } else if (commandName === Command.UnFlip) {
        plainText = `${UNFLIP} ${plainText}`;
        customHtml = `${UNFLIP} ${customHtml}`;
      } else if (commandName) {
        if ((commandName as Command) === Command.Poll) setShowPollPicker(true);
        else if ((commandName as Command) === Command.Location && plainText.trim().length === 0)
          setShowLocationPicker(true);
        else if (commandName === 'gif') {
          setInitialGifSearch(plainText);
          setEmojiBoardTab(EmojiBoardTab.Gif);
        } else {
          const commandContent = commands[commandName as Command];
          if (commandContent) {
            commandContent.exe(plainText, customHtml);
          }
        }
        resetEditor(editor);
        resetEditorHistory(editor);
        sendTypingStatus(false);

        return;
      }

      if (plainText === '') return;

      // PluralKit-style proxy wrappers (per-message profile proxies) must be stripped
      // *before* building `content`, otherwise we end up sending the wrapper verbatim.
      let proxiedPerMessageProfile:
        | Awaited<ReturnType<(typeof pluralkitProxyMessageHandler)['getPmpBasedOnMessage']>>
        | undefined;
      if (pmpProxyingEnable) {
        proxiedPerMessageProfile =
          await pluralkitProxyMessageHandler.getPmpBasedOnMessage(plainText);
        if (proxiedPerMessageProfile) {
          // normal plainText has spoilers stripped, but this breaks spoilers with a proxy tag.
          // here we get a new 'unsanitized' plainText without spoiler stripping
          let unsanitizedPlainText = toPlainText(
            serializedChildren,
            true,
            false,
            nicknameReplacement
          ).trim();

          const stripped = pluralkitProxyMessageHandler.stripProxyFromMessage(unsanitizedPlainText);
          if (stripped !== undefined) {
            // Re-run the normal outgoing pipeline on the stripped content so the message
            // goes through the same transforms/parsers as any other message.
            serializedChildren = plainToEditorInput(stripped);

            outgoingMessageTransforms.forEach((transform) => {
              if (!transform.shouldApply(serializedChildren, outgoingTransformContext)) return;
              serializedChildren = transform.apply(serializedChildren, outgoingTransformContext);
            });

            plainText = toPlainText(serializedChildren, true, true, nicknameReplacement).trim();
            customHtml = trimCustomHtml(
              toMatrixCustomHTML(serializedChildren, {
                stripNickname: true,
                nickNameReplacement: nicknameReplacement,
                forEmote: commandName === Command.Me || commandName === Command.RainbowMe,
                room,
              })
            );

            if (pmpLatchingEnable) {
              await setCurrentlyUsedPerMessageProfileIdForRoom(
                mx,
                roomId,
                proxiedPerMessageProfile.id
              );
              setLatchedPersona(proxiedPerMessageProfile);
            }
          }
        }
      }

      const body = plainText;
      const formattedBody = customHtml;
      const mentionData = getMentions(mx, roomId, editor);

      const content: IContent & Pick<RoomMessageEventContent, 'msgtype' | 'body'> = {
        msgtype: msgType,
        body,
      };

      if (replyDraft && !silentReply) {
        mentionData.users.add(replyDraft.userId);
      }

      content['m.mentions'] = getMentionContent(Array.from(mentionData.users), mentionData.room);
      content[prefix.MATRIX_UNSTABLE_IMAGE_SOURCE_PACK_PROPERTY_NAME] =
        imagePacksUsedRef.current.toJSON();
      content[prefix.MATRIX_UNSTABLE_EMBEDDED_LINK_PREVIEW_PROPERTY_NAME] = [];
      //check setting again here, just in case it was disabled while the message got composed
      if (embedsEnabled && generateBundles) {
        for (const embed of embeds) {
          if (embed.status == EmbedStatus.Loading || embed.status == EmbedStatus.Idle)
            return
          if (embed.status == EmbedStatus.Success) {
            embed.data["matched_url"] = embed.url;
            content[prefix.MATRIX_UNSTABLE_EMBEDDED_LINK_PREVIEW_PROPERTY_NAME].push(embed.data);
          }
        }
      } else {
        const links = getLinks(serializedChildren);
        links?.forEach((link) => {
          content[prefix.MATRIX_UNSTABLE_EMBEDDED_LINK_PREVIEW_PROPERTY_NAME].push({
            matched_url: link,
          })}
        );
      }


      if (replyDraft || !customHtmlEqualsPlainText(formattedBody, body)) {
        content.format = 'org.matrix.custom.html';
        content.formatted_body = formattedBody;
      }

      /**
       * the currently with the room associated per-message profile, if any, so that it can be included in the message content when sending.
       * This allows the server to apply the correct profile-based transformations (e.g. font size adjustments) when processing the message,
       * and also allows clients to display an accurate preview of how the message will look with the profile applied while it's being composed.
       */
      const globalPerMessageProfile = await getCurrentlyUsedPerMessageProfileForAccount(mx);
      const roomPerMessageProfile = await getCurrentlyUsedPerMessageProfileForRoom(mx, roomId);
      let perMessageProfile = latchedPersona ?? roomPerMessageProfile ?? globalPerMessageProfile;

      if (pmpProxyingEnable) {
        if (proxiedPerMessageProfile) perMessageProfile = proxiedPerMessageProfile;
      }
      if (perMessageProfile) {
        content[prefix.MATRIX_UNSTABLE_PER_MESSAGE_PROFILE_PROPERTY_NAME] =
          convertPerMessageProfileToBeeperFormat(perMessageProfile, !pmpNoFallback);

        if (!pmpNoFallback && perMessageProfile.displayname.trim() !== '') {
          // if a per-message profile is used, it must per spec include a fallback
          const pmpPrefix = `${perMessageProfile.displayname}: `;

          if (!content.body.startsWith(pmpPrefix)) {
            // to prevent double-prefixing when the fallback is already present
            content.body = pmpPrefix + content.body;
          }

          /**
           * html escaped version of the display name
           */
          const escapedName = sanitizeText(perMessageProfile.displayname);

          const htmlPrefix = `<strong data-mx-profile-fallback>${escapedName}: </strong>`;

          if (content.formatted_body && !content.formatted_body.startsWith(htmlPrefix)) {
            content.formatted_body = htmlPrefix + content.formatted_body;
          } else {
            // we don't have a formatted body, but we need one
            content.format = 'org.matrix.custom.html';
            const escapedBody = sanitizeText(plainText).replaceAll('\n', '<br/>');
            content.formatted_body = `${htmlPrefix}${escapedBody}`;
          }
        }
      }

      if (replyDraft) {
        content['m.relates_to'] = getReplyContent(replyDraft, room);
      }
      const invalidate = () =>
        queryClient.invalidateQueries({ queryKey: ['delayedEvents', roomId] });

      const resetInput = () => {
        resetEditor(editor);
        resetEditorHistory(editor);
        setInputKey((prev) => prev + 1);
        imagePacksUsedRef.current.clear();
        setReplyDraft(replyDraftBase);
        sendTypingStatus(false);
      };
      if (scheduledTime) {
        try {
          const delayMs = computeDelayMs(scheduledTime);
          if (editingScheduledDelayId) {
            await cancelDelayedEvent(mx, editingScheduledDelayId);
          }
          if (isEncrypted) {
            await sendDelayedMessageE2EE(mx, roomId, room, content, delayMs);
          } else {
            await sendDelayedMessage(mx, roomId, content as RoomMessageEventContent, delayMs);
          }
          setSendError(undefined);
          invalidate();
          setEditingScheduledDelayId(null);
          setScheduledTime(null);
          resetInput();
        } catch (e: unknown) {
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
        try {
          await cancelDelayedEvent(mx, editingScheduledDelayId);
          debugLog.info('message', 'Sending message after cancelling scheduled event', {
            roomId,
            scheduledDelayId: editingScheduledDelayId,
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
          invalidate();
          setEditingScheduledDelayId(null);
          resetInput();
        } catch (error) {
          debugLog.error('message', 'Failed to send message after cancelling scheduled event', {
            roomId,
            error: error instanceof Error ? error.message : String(error),
          });
          // Cancel failed — leave state intact for retry
        }
      } else {
        const msgSendStart = performance.now();
        resetInput();
        debugLog.info('message', 'Sending message', {
          roomId,
          msgtype: content.msgtype,
        });
        Sentry.startSpan(
          {
            name: 'message.send',
            op: 'matrix.message',
            attributes: { encrypted: String(isEncrypted) },
          },
          () => mx.sendMessage(roomId, threadRootId ?? null, content as RoomMessageEventContent)
        )
          .then((res: { event_id: string }) => {
            debugLog.info('message', 'Message sent successfully', {
              roomId,
              eventId: res.event_id,
            });
            Sentry.metrics.distribution(
              'sable.message.send_latency_ms',
              performance.now() - msgSendStart,
              { attributes: { encrypted: String(isEncrypted) } }
            );
          })
          .catch((error: unknown) => {
            debugLog.error('message', 'Failed to send message', {
              roomId,
              error: error instanceof Error ? error.message : String(error),
            });
            Sentry.metrics.count('sable.message.send_error', 1, {
              attributes: { encrypted: String(isEncrypted) },
            });
            log.error('failed to send message', { roomId }, error);
          });
      }
    }, [
      editor,
      replyEvent,
      mx,
      roomId,
      canSendReaction,
      pkCompatEnable,
      replyDraft,
      silentReply,
      pmpProxyingEnable,
      pmpLatchingEnable,
      pmpNoFallback,
      pluralkitProxyMessageHandler,
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
      setReplyDraft,
      settingsLinkBaseUrl,
      isEncrypted,
      setEditingScheduledDelayId,
      setScheduledTime,
      setServerMaxDelayMs,
      replyDraftBase,
      selectedFiles,
      enableMediaGalleries,
      sendIndividualAttachmentAsCaption,
      editingEvent,
      getEditingContent,
      onCancelEdit,
      latchedPersona,
        embedsEnabled,
        embedLinks,
        embeds
    ]);
    const [generateBundles] = useSetting(settingsAtom, 'generateBundles');
    const [encryptBundledMedia] = useSetting(settingsAtom, 'encryptBundledMedia');

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
              selectedItem.click();
              return;
            }
          }
        }

        if (isKeyHotkey('arrowup', evt) && isEmptyEditor(editor)) {
          const { selection } = editor;
          if (selection && Editor.isStart(editor, selection.anchor, [])) {
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
          submit().catch((error) => {
            log.error('submit failed', { roomId }, error);
          });
          return;
        }
        if (isKeyHotkey('escape', evt)) {
          evt.preventDefault();
          if (editingEvent && isMobileOrTablet()) {
            onCancelEdit?.();
            resetEditor(editor);
            resetEditorHistory(editor);
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
          sendTypingStatus(!isEmptyEditor(editor));
        }

        const firstPosition = Editor.start(editor, []);
        const secondChar = Editor.after(editor, firstPosition, {
          distance: 2,
          unit: 'character',
        });
        const quickReactPrefix = Editor.string(
          editor,
          Editor.range(editor, firstPosition, secondChar)
        );
        if (quickReactPrefix === '+#') {
          setQuickTextReact(true);
          setAutocompleteQuery(undefined);
          return;
        }
        setQuickTextReact(false);

        const prevWordRange = getPrevWorldRange(editor);
        if (!prevWordRange) {
          setAutocompleteQuery(undefined);
          return;
        }

        const isRangeAtBeginning = !Point.isAfter(Range.start(prevWordRange), firstPosition);
        const query =
          (isRangeAtBeginning
            ? getAutocompleteQuery(editor, prevWordRange, BEGINNING_AUTOCOMPLETE_PREFIXES)
            : undefined) ??
          getAutocompleteQuery(editor, prevWordRange, ANYWHERE_AUTOCOMPLETE_PREFIXES);

        setAutocompleteQuery(query);
      },
      [editor, sendTypingStatus, hideActivity]
    );

    const checkForEmbedables = (text: string) => {
      if (!generateBundles) {
        return;
      }
      //from https://regex101.com/r/3fYy3x/1
      const URL_REGEX = RegExp(/http[s]?:\/\/.(?:www\.)?[-a-zA-Z0-9@%._\+~#=]{2,256}\.[a-z]{2,10}\b(?:[-a-zA-Z0-9@:%_\+.~#?&\/\/=]*)/gm)
      const urls = Array.from(text.matchAll(URL_REGEX)
          //dont include the url if its in angled braces  like <https://example.org> cant do this in regex because braces are context free (yay computer science)
          .filter((e) => !(e.index > 0 && text[e.index - 1] == '<' && text[e.index + e[0].length] == '>') )
          .map((e) => e[0]));
      if (urls.length > 0) {
        setUploadBoard(true);

        const embedItems = urls.map((url): TEmbeddItem =>  ({
          url: url
        }));
        setEmbedLinks({
          type: 'CLEAR'
        });
        setEmbedLinks({
          type: "PUT",
          item: embedItems
        })

      } else {
        setEmbedLinks({
          type: 'CLEAR'
        });
        setEmbedsEnabled(false);
      }
    };

    const handleEmbedsToggle = (state: boolean) => {
      setEmbedsEnabled(state)
        for (const param of roomEmbedAtomFamily.getParams()) {
          roomEmbedAtomFamily.remove(param);
        }
    }

    const handleEmoticonSelect = (key: string, shortcode: string) => {
      const emoticonEl = createEmoticonElement(key, shortcode);
      if (autocompleteQuery) {
        replaceWithElement(editor, autocompleteQuery.range, emoticonEl);
      } else {
        editor.insertNode(emoticonEl);
      }
      if (!imagePacksUsedRef.current.has(key)) {
        const imgPkRef = getImagePackReferencesForMxc(key, mx, ImageUsage.Emoticon, room);
        if (imgPkRef?.room_id && imgPkRef?.shortcode) imagePacksUsedRef.current.set(key, imgPkRef);
      }
      moveCursor(editor);
      handleCloseAutocomplete();
    };

    const handleStickerSelect = async (mxc: string, shortcode: string, label: string) => {
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

      /**
       * the currently with the room associated per-message profile, if any, so that it can be included in the message content when sending.
       * This allows the server to apply the correct profile-based transformations (e.g. font size adjustments) when processing the message,
       * and also allows clients to display an accurate preview of how the message will look with the profile applied while it's being composed.
       */
      const globalPerMessageProfile = await getCurrentlyUsedPerMessageProfileForAccount(mx);
      const roomPerMessageProfile = await getCurrentlyUsedPerMessageProfileForRoom(mx, roomId);
      const perMessageProfile = roomPerMessageProfile ?? globalPerMessageProfile;

      if (perMessageProfile) {
        content[prefix.MATRIX_UNSTABLE_PER_MESSAGE_PROFILE_PROPERTY_NAME] =
          convertPerMessageProfileToBeeperFormat(perMessageProfile, false);
      }
      content[prefix.MATRIX_UNSTABLE_IMAGE_SOURCE_PACK_PROPERTY_NAME] =
        getImagePackReferencesForMxcWrappedInMap(mxc, mx, ImageUsage.Sticker, room);

      if (replyDraft) {
        content['m.relates_to'] = getReplyContent(replyDraft, room);
        if (!silentReply && replyDraft)
          content['m.mentions'] = { ['user_ids']: [replyDraft.userId] };
        setReplyDraft(replyDraftBase);
      }
      try {
        await mx.sendEvent(roomId, EventType.Sticker, content);
      } catch (error) {
        log.error('failed to send sticker', { roomId }, error);
      }
    };

    const handleGifSelect = async (gif: GifData, spoiler?: boolean) => {
      const url = getSendableKlipyMxcUrl(gif.url, clientConfig.gifs?.proxyUrl);
      if (!url) return;

      const content = await getGifMsgContent(mx, gif, url, spoiler);
      if (!content) return;

      await handleSendContents([content]);
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
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.UserMention && (
          <UserMentionAutocomplete
            room={room}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.Emoticon && (
          <EmoticonAutocomplete
            imagePackRooms={imagePackRooms}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
            onEmoticonSelected={handleEmoticonSelect}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.Reaction &&
          (canSendReaction ? (
            <EmoticonAutocomplete
              title={`React with :${autocompleteQuery.text}`}
              imagePackRooms={imagePackRooms}
              editor={editor}
              query={autocompleteQuery}
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
            editor={editor}
            query={autocompleteQuery}
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
          key={inputKey}
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
              {(selectedFiles.length > 0 || (embedLinks.length > 0 && generateBundles)) && (
                <UploadBoard
                  header={
                    <UploadBoardHeader
                      open={uploadBoard}
                      onToggle={() => setUploadBoard(!uploadBoard)}
                      uploadFamilyObserverAtom={uploadFamilyObserverAtom}
                      onSend={async (uploads) => {
                        setUploadSending(true);
                        try {
                          await handleSendUpload(uploads);
                        } finally {
                          setUploadSending(false);
                        }
                      }}
                      onBusyChange={setUploadBusy}
                      imperativeHandlerRef={uploadBoardHandlers}
                      onCancel={handleCancelUpload}
                    />
                  }
                >
                  {(uploadBoard) && (
                    <Scroll direction="Horizontal" size="300" hideTrack visibility="Hover">
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

                          {(embedLinks.length > 0 ) && generateBundles && (<>
                            {selectedFiles.length > 0 && <Box style={{borderLeft: '1px solid currentColor'}}/>}
                            <UploadCard
                              key="embed_toggle"
                              radii="300"
                              compact
                              style={{maxWidth: toRem(400), flexShrink: 0}}
                              before={<></>}
                              after={
                                //fake close button to keep box size
                                <div style={{visibility: "hidden"}}>
                                  <IconButton
                                      aria-label="Cancel Upload"
                                      variant="SurfaceVariant"
                                      radii="Pill"
                                      size="300"
                                  >
                                    {sizedIcon(X, '200')}
                                  </IconButton>

                                </div>}
                              bottom={<>
                                <Box wrap="Wrap" alignItems={"Center"} direction="Column" gap={"200"}>
                                  <Text>
                                    Bundled <br/> Embeds
                                  </Text>

                                  <Switch value={embedsEnabled} onChange={handleEmbedsToggle}/>
                                </Box>

                              </>}
                          >
                            <Text size="H6" truncate style={{minWidth: 0, flexGrow: 1}}>
                              {"Links found"}
                            </Text>
                          </UploadCard></>)}
                        {embedsEnabled && Array.from(embedLinks)
                            .map((link) => (

                                <EmbedCardRenderer url={link.url} encrypt={room.hasEncryptionStateEvent() && encryptBundledMedia} successCallback={ (_) => {}}/>
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
                        resetEditor(editor);
                        resetEditorHistory(editor);
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
                      attachmentSkipReturnFocusRef.current = false;
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
                            pickFile('image/*,.tgs');
                          }}
                          onPickFile={() => {
                            pickFile('*');
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
                                pickFile('image/*,.tgs');
                                setAddMenuAnchor(undefined);
                              }}
                              before={menuIcon(ImageIcon)}
                            >
                              <Text size="B300">Photos</Text>
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
              {pmpPickerEnable && (
                <PersistentPersonaPicker
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
                  const triggers = (
                    <>
                      {editorButtonOrder.map((id) => {
                        let button: ReactElement | null = null;
                        if (id === 'gif' && editorGifButton) {
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
                        } else if (id === 'sticker' && editorStickerButton) {
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
                            keyboardAware
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
                        const buttonRefs: Record<EditorButtonId, RefObject<HTMLButtonElement>> = {
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
                    audioRecorderRef.current?.stop();
                    return;
                  }
                  if (hasContent) {
                    if (isLongPress.current) {
                      isLongPress.current = false;
                      return;
                    }
                    submit();
                    return;
                  }
                  if (!editorMicButton) return;
                  if (isMobileOrTablet()) return;
                  setShowAudioRecorder(true);
                }}
                onMouseDown={(e: MouseEvent) => {
                  if (hasContent) e.preventDefault();
                }}
                onPointerDown={() => {
                  if (showAudioRecorder) return;
                  if (hasContent) {
                    isLongPress.current = false;
                    if (isMobileOrTablet() && delayedEventsSupported) {
                      longPressTimer.current = setTimeout(() => {
                        isLongPress.current = true;
                        setShowSchedulePicker(true);
                      }, 1000);
                    }
                    return;
                  }
                  if (!editorMicButton) return;
                  if (!isMobileOrTablet()) return;
                  micHoldStartRef.current = Date.now();
                  setShowAudioRecorder(true);

                  function discardRecording() {
                    releaseListeners();
                    setTimeout(() => {
                      audioRecorderRef.current?.cancel();
                    }, 50);
                  }
                  function onUp() {
                    const held = Date.now() - micHoldStartRef.current;
                    if (held >= HOLD_THRESHOLD_MS) {
                      releaseListeners();
                      setTimeout(() => {
                        audioRecorderRef.current?.stop();
                      }, 50);
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
                onPointerUp={() => {
                  if (longPressTimer.current !== null) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                  }
                }}
                onPointerCancel={() => {
                  if (longPressTimer.current !== null) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                  }
                }}
                disabled={hasContent && sendBusy && !showAudioRecorder}
                className={hasContent && delayedEventsSupported ? css.SplitSendButton : undefined}
              >
                {showAudioRecorder ? (
                  <Stop
                    size={getPhosphorIconSize('toolbar')}
                    weight="fill"
                    style={{ color: color.Critical.Main }}
                  />
                ) : hasContent || !editorMicButton ? (
                  sendBusy ? (
                    <Spinner size="300" variant="Secondary" />
                  ) : scheduledTime ? (
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
              {delayedEventsSupported && !isMobileOrTablet() && (
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
          bottom={<MarkdownFormattingToolbarBottom />}
        />
        {showSchedulePicker && (
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
            mx={mx}
            room={room}
            replyDraft={replyDraft}
            clearReplyDraft={() => setReplyDraft(replyDraftBase)}
          />
        )}
        {showLocationPicker && (
          <Suspense fallback={null}>
            <LocationDialog
              onCancel={() => setShowLocationPicker(false)}
              mx={mx}
              room={room}
              replyDraft={replyDraft}
              clearReplyDraft={() => setReplyDraft(replyDraftBase)}
            />
          </Suspense>
        )}
      </div>
    );
  }
);
