/* oxlint-disable typescript/no-explicit-any, typescript/no-extraneous-class, unicorn/consistent-function-scoping, vitest/require-mock-type-parameters */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { ProseMirrorEditorController } from '$components/editor/prosemirrorController';
import { M_POLL_START } from 'matrix-js-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomInput } from './RoomInput';
import type * as MsgContentModule from './msgContent';
import {
  roomIdToMsgDraftAtomFamily,
  roomIdToReplyDraftAtomFamily,
  roomIdToUploadItemsAtomFamily,
} from '$state/room/roomInputDrafts';
import {
  roomIdToEditingScheduledDelayIdAtomFamily,
  roomIdToScheduledTimeAtomFamily,
} from '$state/scheduledMessages';
import { roomScheduleCoordinator } from '$state/room/roomScheduleCoordinator';

const testState = vi.hoisted(() => ({
  isMobile: false,
  editorTriggerButtons: false,
  matrix: {
    sendMessage: vi.fn(),
    sendEvent: vi.fn(),
    getUserId: vi.fn(() => '@me:example.org'),
    getSafeUserId: vi.fn(() => '@me:example.org'),
  },
  cancelDelayedEvent: vi.fn(),
  sendDelayedMessage: vi.fn(),
  pendingUploads: [] as unknown[],
  sendIndividualAttachmentAsCaption: false,
  encrypted: false,
  handleFiles: undefined as ((files: File[]) => Promise<void>) | undefined,
  safeUploadFile: vi.fn(),
  encryptFile: vi.fn(),
  accountPersonaSelection: undefined as any,
  roomPersonaSelection: undefined as any,
  editingEvent: undefined as
    | { getId: () => string; getContent: () => Record<string, unknown> }
    | undefined,
}));

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => testState.matrix,
}));

vi.mock(import('$utils/platform'), async (importOriginal) => ({
  ...(await importOriginal()),
  isMobileOrTablet: () => testState.isMobile,
  isMobileTauri: () => false,
}));

vi.mock('$state/hooks/settings', () => ({
  useSetting: (_atom: unknown, key: string) => {
    const values: Record<string, unknown> = {
      enterForNewline: false,
      editorGifButton: testState.editorTriggerButtons,
      editorEmojiButton: testState.editorTriggerButtons,
      editorStickerButton: testState.editorTriggerButtons,
      editorMicButton: false,
      editorButtonOrder: testState.editorTriggerButtons ? ['gif', 'sticker', 'emoji'] : [],
      shortcutOverrides: {},
      hideActivity: true,
      mentionInReplies: true,
      pkCompat: false,
      pmpProxying: false,
      pmpPicker: false,
      hour24Clock: false,
      enableMediaGalleries: false,
      sendIndividualAttachmentAsCaption: testState.sendIndividualAttachmentAsCaption,
    };
    return [values[key], vi.fn()];
  },
}));

vi.mock('$state/settings', () => ({ settingsAtom: {} }));

vi.mock('$state/room/roomInputDrafts', async () => {
  const { atom } = await import('jotai');
  const msgDraftAtom = atom([]);
  const replyDraftAtom = atom(undefined);
  const uploadItemsAtom = atom<unknown[], [unknown], void>([], (get, set, action) => {
    const update = action as any;
    if (Array.isArray(update)) {
      set(uploadItemsAtom, update);
      return;
    }
    if (update?.type === 'PUT') set(uploadItemsAtom, [...get(uploadItemsAtom), ...update.item]);
    if (update?.type === 'DELETE') {
      const deleted = new Set(Array.isArray(update.item) ? update.item : [update.item]);
      set(
        uploadItemsAtom,
        get(uploadItemsAtom).filter((item: any) => !deleted.has(item))
      );
    }
    if (update?.type === 'REPLACE') {
      set(
        uploadItemsAtom,
        get(uploadItemsAtom).map((item: any) => (item === update.item ? update.replacement : item))
      );
    }
  });
  const scheduledTimeAtom = atom(null);
  const editingScheduledDelayIdAtom = atom(null);
  return {
    roomIdToMsgDraftAtomFamily: () => msgDraftAtom,
    roomIdToReplyDraftAtomFamily: () => replyDraftAtom,
    roomIdToUploadItemsAtomFamily: () => uploadItemsAtom,
    roomUploadAtomFamily: Object.assign(() => atom(undefined), { remove: vi.fn() }),
    roomIdToScheduledTimeAtomFamily: () => scheduledTimeAtom,
    roomIdToEditingScheduledDelayIdAtomFamily: () => editingScheduledDelayIdAtom,
  };
});

vi.mock('$state/upload', async () => {
  const { atom } = await import('jotai');
  const observerAtom = atom([]);
  return {
    UploadStatus: { Loading: 'loading', Success: 'success' },
    createUploadFamilyObserverAtom: () => observerAtom,
  };
});

vi.mock('$components/editor', async () => {
  const { useAutocompleteQuery } =
    await import('$components/editor/autocomplete/useAutocompleteQuery');
  const textOf = (nodes: any[]): string =>
    nodes
      .map((node) => (typeof node.text === 'string' ? node.text : textOf(node.children ?? [])))
      .join('\n');
  const passthrough = ({ children }: { children?: unknown }) => children ?? null;
  const CustomEditor = ({
    editableName,
    editor,
    onChange,
    onKeyDown,
    before,
    top,
    after,
    bottom,
  }: any) => {
    const [, setRevision] = useState(0);
    useEffect(() => editor.subscribe(() => setRevision((value) => value + 1)), [editor]);
    return (
      <div>
        {top}
        {before}
        <div
          data-editable-name={editableName}
          data-testid={editableName === 'RoomInput' ? 'room-input-editor' : undefined}
          data-editor-text={editableName === 'RoomInput' ? textOf(editor.children) : undefined}
          contentEditable
          role="textbox"
          aria-label="Room message"
          tabIndex={0}
          onInput={onChange}
          onKeyDown={onKeyDown}
        />
        {after}
        {bottom}
      </div>
    );
  };
  return {
    AutocompletePrefix: {
      RoomMention: 'room-mention',
      UserMention: 'user-mention',
      Emoticon: 'emoticon',
      Reaction: 'reaction',
      Command: 'command',
    },
    ANYWHERE_AUTOCOMPLETE_PREFIXES: [],
    BEGINNING_AUTOCOMPLETE_PREFIXES: [],
    BlockType: { Paragraph: 'paragraph', Command: 'command' },
    Command: { Poll: 'poll', Location: 'location' },
    CustomEditor,
    EmoticonAutocomplete: passthrough,
    MarkdownFormattingToolbarBottom: passthrough,
    MarkdownFormattingToolbarToggle: passthrough,
    RoomMentionAutocomplete: passthrough,
    UserMentionAutocomplete: passthrough,
    createEmoticonElement: () => ({ text: '' }),
    customHtmlEqualsPlainText: (html: string, text: string) => html === text,
    focusEditor: vi.fn(),
    getAutocompleteQuery: vi.fn(),
    getBeginCommand: (editor: any) => editor.children[0]?.children?.[1]?.command,
    getDocumentLinks: () => [],
    getLinks: () => [],
    getMentions: () => ({ users: new Set<string>(), room: undefined }),
    getPrevWorldRange: () => undefined,
    isEmptyEditor: (editor: any) => textOf(editor.children).trim() === '',
    markEventConsumedByHost: vi.fn(),
    moveCursor: vi.fn(),
    plainToEditorInput: (text: string) => [{ type: 'paragraph', children: [{ text }] }],
    replaceWithElement: vi.fn(),
    resetEditor: (editor: any) => {
      editor.children = [{ type: 'paragraph', children: [{ text: '' }] }];
      editor.selection = null;
    },
    resetEditorHistory: vi.fn(),
    toMatrixCustomHTML: (nodes: any[]) => textOf(nodes),
    toPlainText: textOf,
    trimCommand: (_command: unknown, text: string) => text,
    trimCustomHtml: (html: string) => html,
    useAutocompleteQuery,
  };
});

vi.mock('$components/upload-board', async () => {
  const UploadBoardHeader = ({ imperativeHandlerRef }: any) => {
    useImperativeHandle(imperativeHandlerRef, () => ({
      getSendableUploads: () => testState.pendingUploads,
    }));
    return null;
  };
  const UploadBoard = ({ header, children }: any) => (
    <>
      {header}
      {children}
    </>
  );
  return {
    UploadBoard,
    UploadBoardContent: ({ children }: any) => <>{children}</>,
    UploadBoardHeader,
  };
});

vi.mock('./input/MarkdownPreview', () => ({
  MarkdownPreview: () => null,
}));

vi.mock('$components/upload-card', () => ({
  UploadCardRenderer: ({ fileItem, setMetadata, setDesc }: any) => (
    <>
      <button
        type="button"
        onClick={() => setMetadata(fileItem, { ...fileItem.metadata, markedAsSpoiler: true })}
      >
        Update attachment metadata
      </button>
      <button
        type="button"
        onClick={() => setDesc(fileItem, 'updated description', 'updated description')}
      >
        Update attachment description
      </button>
    </>
  ),
}));
vi.mock('./msgContent', async (importOriginal) => ({
  ...(await importOriginal<typeof MsgContentModule>()),
  getGifMsgContent: (gif: { title: string }) => ({
    msgtype: 'm.image',
    body: `${gif.title}.gif`,
    url: 'mxc://gifs.sable.moe/tenor_QWJDZEVmMTIz',
    info: { w: 320, h: 240, mimetype: 'image/gif' },
  }),
}));
vi.mock('$components/attachment-sheet/AttachmentSheet', () => ({ AttachmentSheet: () => null }));
vi.mock('$components/emoji-board', () => ({
  EmojiBoard: ({ onStickerSelect, onGifSelect, requestClose }: any) => (
    <>
      <button type="button" onClick={() => onStickerSelect('mxc://sticker', 'sticker', 'sticker')}>
        Select sticker
      </button>
      <button
        type="button"
        onClick={() =>
          onGifSelect({
            id: 'gif-id',
            title: 'gif',
            shareUrl: 'https://tenor.com/view/gif-id',
            mediaUrl: 'https://media.tenor.com/gif-id/gif.gif',
            width: 320,
            height: 240,
            mimetype: 'image/gif',
          })
        }
      >
        Select GIF
      </button>
      <button type="button" onClick={requestClose}>
        Close media picker
      </button>
    </>
  ),
  EmojiBoardTab: { Emoji: 'emoji', Gif: 'gif', Sticker: 'sticker' },
}));
vi.mock('$components/UseStateProvider', () => ({
  UseStateProvider: ({ children }: any) => (typeof children === 'function' ? children() : children),
}));
vi.mock('$components/message', () => ({ Reply: () => null, ThreadIndicator: () => null }));
vi.mock('./CommandAutocomplete', () => ({ CommandAutocomplete: () => null }));
vi.mock('./AudioMessageRecorder', () => ({ AudioMessageRecorder: () => null }));
vi.mock('./persona-picker/PersonaPicker', () => ({
  PersistentPersonaPicker: () => null,
  PersonaPickerTab: { Global: 'Global', PerRoom: 'PerRoom' },
}));
vi.mock('./schedule-send', () => ({ SchedulePickerDialog: () => null }));
vi.mock('./poll-modals', () => ({
  PollDialog: ({ onSubmit, onCancel }: any) => (
    <>
      <button
        type="button"
        onClick={() => void onSubmit({ msgtype: 'm.poll.start', body: 'poll' }).catch(() => {})}
      >
        Submit poll
      </button>
      <button type="button" onClick={onCancel}>
        Cancel poll
      </button>
    </>
  ),
}));
vi.mock('./location-modal', () => ({
  LocationDialog: ({ onSubmit, onCancel }: any) => {
    const [failed, setFailed] = useState(false);
    return (
      <>
        {failed && <div data-testid="location-submit-failed">location submit failed</div>}
        <button
          type="button"
          onClick={() =>
            void onSubmit({ msgtype: 'm.location', body: 'location' }).then(onCancel, () =>
              setFailed(true)
            )
          }
        >
          Submit location
        </button>
        <button type="button" onClick={onCancel}>
          Cancel location
        </button>
      </>
    );
  },
}));
vi.mock('$components/icons/phosphor', () => {
  const Icon = forwardRef<HTMLButtonElement, { children?: ReactNode }>(({ children }, ref) => (
    <button ref={ref}>{children}</button>
  ));
  return {
    Bell: Icon,
    BellSlash: Icon,
    CaretDown: Icon,
    Clock: Icon,
    File: Icon,
    Gif: Icon,
    Image: Icon,
    ListBullets: Icon,
    MapPinPlusIcon: Icon,
    Microphone: Icon,
    PaperPlaneTilt: Icon,
    PencilSimple: Icon,
    PlusCircle: Icon,
    Smiley: Icon,
    Sticker: Icon,
    Stop: Icon,
    X: Icon,
    chipIcon: () => null,
    composerIcon: () => null,
    dropzoneIcon: () => null,
    getPhosphorIconSize: () => 16,
    menuIcon: () => null,
  };
});

vi.mock('folds', () => {
  const Box = ({ children }: any) => <div>{children}</div>;
  const Button = forwardRef<HTMLButtonElement, any>(({ children, ...props }, ref) => (
    <button ref={ref} {...props}>
      {children}
    </button>
  ));
  const passthrough = ({ children }: any) => <>{children}</>;
  return {
    Box,
    Dialog: passthrough,
    IconButton: Button,
    Menu: passthrough,
    MenuItem: Button,
    Overlay: passthrough,
    OverlayBackdrop: () => null,
    OverlayCenter: passthrough,
    PopOut: ({ children, content }: any) => (
      <>
        {children}
        {content}
      </>
    ),
    Scroll: passthrough,
    Spinner: () => <span>Sending</span>,
    Text: ({ children }: any) => <span>{children}</span>,
    color: { Critical: { Main: 'red' } },
    config: { space: { S100: '1px', S200: '2px', S300: '3px' } },
    toRem: (value: number) => `${value / 16}rem`,
  };
});

vi.mock('$hooks/useTypingStatusUpdater', () => ({ useTypingStatusUpdater: () => vi.fn() }));
vi.mock('$hooks/useFilePicker', () => ({
  useFilePicker: (handleFiles: (files: File[]) => Promise<void>) => {
    testState.handleFiles = handleFiles;
    return vi.fn();
  },
}));
vi.mock('$hooks/useFilePasteHandler', () => ({ useFilePasteHandler: () => vi.fn() }));
vi.mock('$hooks/useFileDrop', () => ({ useFileDropZone: () => false }));
vi.mock('$hooks/useCommands', () => ({
  Command: { Poll: 'poll', Location: 'location' },
  SHRUG: '¯\\_(ツ)_/¯',
  TABLEFLIP: '(╯°□°）╯︵ ┻━┻',
  UNFLIP: '┬─┬ノ( º _ ºノ)',
  useCommands: () => ({}),
}));
vi.mock('$hooks/useClientConfig', () => ({ useClientConfig: () => ({}) }));
vi.mock('$hooks/useMediaAuthentication', () => ({ useMediaAuthentication: () => false }));
vi.mock('$hooks/useImagePackRooms', () => ({ useImagePackRooms: () => [] }));
vi.mock('$hooks/useComposingCheck', () => ({ useComposingCheck: () => () => false }));
vi.mock('$hooks/usePerMessageProfile', () => ({
  convertPerMessageProfileToBeeperFormat: () => ({}),
  resolvePersona: () => undefined,
  resolvePersonaProxy: () => undefined,
  getCurrentlyUsedPerMessageProfileForAccount: async () => undefined,
  getCurrentlyUsedPerMessageProfileForRoom: async () => undefined,
}));
vi.mock('$app/persona/catalog', () => ({
  ProfileCatalog: class {
    list = async () => [];
    getSelection = async (scope: 'account' | { roomId: string }) =>
      scope === 'account' ? testState.accountPersonaSelection : testState.roomPersonaSelection;
  },
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('$hooks/usePowerLevels', () => ({
  usePowerLevelsContext: () => ({}),
  useRoomPermissions: () => ({ event: () => true }),
}));
vi.mock('$hooks/useRoomPermissions', () => ({ useRoomPermissions: () => ({ event: () => true }) }));
vi.mock('$hooks/useRoomCreators', () => ({ useRoomCreators: () => [] }));
vi.mock('$features/settings/useSettingsLinkBaseUrl', () => ({ useSettingsLinkBaseUrl: () => '' }));
vi.mock('$state/room/roomToParents', async () => {
  const { atom } = await import('jotai');
  return { roomToParentsAtom: atom({}) };
});
vi.mock('$state/nicknames', async () => {
  const { atom } = await import('jotai');
  return { nicknamesAtom: atom({}) };
});
vi.mock('$state/scheduledMessages', async () => {
  const { atom } = await import('jotai');
  const scheduledTimeAtom = atom(null);
  const editingScheduledDelayIdAtom = atom(null);
  return {
    delayedEventsSupportedAtom: atom(false),
    getScheduledMessageStateKey: (userId: string, roomId: string) => `${userId}\0${roomId}`,
    roomIdToScheduledTimeAtomFamily: () => scheduledTimeAtom,
    roomIdToEditingScheduledDelayIdAtomFamily: () => editingScheduledDelayIdAtom,
    serverMaxDelayMsAtom: atom(null),
  };
});
vi.mock('$utils/matrix', () => ({
  cancelUploadContent: vi.fn(),
  encryptFile: testState.encryptFile,
  getImageInfo: vi.fn(),
  mxcUrlToHttp: vi.fn(),
  toggleReaction: vi.fn(),
}));
vi.mock('$utils/mimeTypes', () => ({
  FALLBACK_MIMETYPE: 'application/octet-stream',
  TGS_MIMETYPE: 'application/x-tgsticker',
  isImageMimeType: () => false,
  safeUploadFile: testState.safeUploadFile,
}));
vi.mock('$utils/dom', () => ({ loadImageElementFromMediaUrl: vi.fn() }));
vi.mock('$plugins/custom-emoji/utils', () => ({ getPackImageInfo: () => undefined }));
vi.mock('$utils/msc4459helper', () => ({
  getImagePackReferencesForMxc: () => undefined,
  getImagePackReferencesForMxcWrappedInMap: () => ({}),
}));
vi.mock('$utils/room/relations', () => ({
  getEditedEvent: vi.fn(),
  getMentionContent: () => ({ user_ids: [] }),
  getThreadReplyEvents: () => [],
}));
vi.mock('$plugins/markdown', () => ({ htmlToMarkdown: (html: string) => html }));
vi.mock('$utils/delayedEvents', () => ({
  cancelDelayedEvent: testState.cancelDelayedEvent,
  computeDelayMs: vi.fn(),
  sendDelayedMessage: testState.sendDelayedMessage,
  sendDelayedMessageE2EE: vi.fn(),
}));
vi.mock('$utils/time', () => ({
  daysToMs: () => 1,
  timeDayMonthYear: () => '',
  timeHourMinute: () => '',
}));
vi.mock('$utils/keyboard', () => ({ stopPropagation: vi.fn() }));
vi.mock('$utils/debug', () => ({ createLogger: () => ({ error: vi.fn(), warn: vi.fn() }) }));
vi.mock('$utils/debugLogger', () => ({
  createDebugLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));
vi.mock('$plugins/pluralkit-handler/PKitCommandMessageHandler', () => ({
  PKitCommandMessageHandler: class {
    static isPKCommand() {
      return false;
    }
  },
}));
vi.mock('$plugins/pluralkit-handler/PKitProxyMessageHandler', () => ({
  PKitProxyMessageHandler: class {
    init() {}
    async getPmpBasedOnMessage() {
      return undefined;
    }
  },
}));
vi.mock('$sentry/react', () => ({
  metrics: { count: vi.fn(), distribution: vi.fn() },
  startSpan: (_options: unknown, callback: () => unknown) => callback(),
}));

const room = {
  roomId: '!room:example.org',
  name: 'Test room',
  hasEncryptionStateEvent: () => testState.encrypted,
  findEventById: (eventId: string) =>
    eventId === testState.editingEvent?.getId() ? testState.editingEvent : undefined,
  getTimelineForEvent: () => undefined,
  getMember: () => undefined,
  getLiveTimeline: () => ({ getEvents: () => [] }),
} as any;

function RoomInputHarness({
  editId,
  onCancelEdit,
  scheduled = false,
  scheduledText = false,
  initialDraft,
  initialReply = false,
  threadRootId,
}: {
  editId?: string;
  onCancelEdit?: () => void;
  scheduled?: boolean;
  /** Schedules a text-only send, with no attachments involved. */
  scheduledText?: boolean;
  initialDraft?: string;
  initialReply?: boolean;
  threadRootId?: string;
}) {
  const editor = useMemo(() => {
    return new ProseMirrorEditorController();
  }, []);
  const [, setEditorRevision] = useState(0);
  const fileDropContainerRef = useMemo(() => ({ current: null }), []);
  const [, setMsgDraft] = useAtom(roomIdToMsgDraftAtomFamily(room.roomId));
  const [, setSelectedFiles] = useAtom(roomIdToUploadItemsAtomFamily(room.roomId));
  const [, setReplyDraft] = useAtom(roomIdToReplyDraftAtomFamily(room.roomId));
  const [, setScheduledTime] = useAtom(roomIdToScheduledTimeAtomFamily(room.roomId));
  const [, setEditingScheduledDelayId] = useAtom(
    roomIdToEditingScheduledDelayIdAtomFamily(room.roomId)
  );
  useEffect(() => {
    (setMsgDraft as any)(
      initialDraft ? [{ type: 'paragraph', children: [{ text: initialDraft }] }] : []
    );
    (setSelectedFiles as any)([]);
    setReplyDraft(
      initialReply ? { userId: '@other:example.org', eventId: '$reply', body: 'reply' } : undefined
    );
    setScheduledTime(scheduledText ? new Date('2026-07-28T12:00:00.000Z') : null);
    setEditingScheduledDelayId(null);
  }, [
    scheduledText,
    initialDraft,
    initialReply,
    setEditingScheduledDelayId,
    setMsgDraft,
    setReplyDraft,
    setScheduledTime,
    setSelectedFiles,
  ]);
  const setText = (text = 'retry me') => {
    editor.setDocument([{ type: 'paragraph' as any, children: [{ text }] }]);
    fireEvent.input(screen.getByTestId('room-input-editor'));
    setEditorRevision((prev) => prev + 1);
  };
  const setCommand = (command: 'poll' | 'location') => {
    editor.setDocument([
      {
        type: 'paragraph' as any,
        children: [
          { text: '' },
          { type: 'command' as any, command, children: [{ text: `/${command}` }] },
          { text: '' },
        ],
      },
    ]);
    fireEvent.input(screen.getByTestId('room-input-editor'));
  };
  return (
    <>
      <button type="button" onClick={() => setText()}>
        Compose text
      </button>
      <button type="button" onClick={() => setText('updated while sending')}>
        Compose updated text
      </button>
      <button type="button" onClick={() => setText('/gif cats')}>
        Compose GIF command
      </button>
      <button type="button" onClick={() => setCommand('poll')}>
        Compose poll command
      </button>
      <button type="button" onClick={() => setCommand('location')}>
        Compose location command
      </button>
      <button
        type="button"
        onClick={() =>
          setReplyDraft({
            userId: '@new:example.org',
            eventId: '$new-reply',
            body: 'newer reply',
          })
        }
      >
        Select newer reply
      </button>
      <button
        type="button"
        onClick={() => {
          const upload = testState.pendingUploads[0] as any;
          const file =
            upload?.file ?? new File(['attachment'], 'attachment.txt', { type: 'text/plain' });
          if (!upload) {
            testState.pendingUploads = [
              {
                status: 'loading',
                file,
                promise: Promise.resolve({ content_uri: 'mxc://example/attachment' }),
              },
            ];
          }
          setSelectedFiles({
            type: 'PUT',
            item: [
              {
                file,
                originalFile: file,
                encInfo: undefined,
                metadata: { markedAsSpoiler: false },
              },
            ],
          });
        }}
      >
        Prepare attachment
      </button>
      <button
        type="button"
        onClick={() => {
          const files = [
            new File(['first'], 'first.txt', { type: 'text/plain' }),
            new File(['second'], 'second.txt', { type: 'text/plain' }),
          ];
          testState.pendingUploads = files.map((file, index) => ({
            status: 'success',
            file,
            mxc: `mxc://example/${index}`,
          }));
          setSelectedFiles({
            type: 'PUT',
            item: files.map((file) => ({
              file,
              originalFile: file,
              encInfo: undefined,
              metadata: { markedAsSpoiler: false },
            })),
          });
          if (scheduled) {
            setScheduledTime(new Date('2026-07-28T12:00:00.000Z'));
            setEditingScheduledDelayId('$scheduled-delay');
          }
        }}
      >
        Prepare two attachments
      </button>
      <RoomInput
        editor={editor}
        fileDropContainerRef={fileDropContainerRef}
        roomId={room.roomId}
        room={room}
        threadRootId={threadRootId}
        editId={editId}
        onCancelEdit={onCancelEdit}
      />
    </>
  );
}

function DraftObserver() {
  const draft = useAtomValue(roomIdToMsgDraftAtomFamily(room.roomId));
  return (
    <div data-testid="draft-observer">{((draft[0] as any)?.children?.[0] as any)?.text ?? ''}</div>
  );
}

function DraftSetter({ text }: { text: string }) {
  const [, setDraft] = useAtom(roomIdToMsgDraftAtomFamily(room.roomId));
  useEffect(() => {
    setDraft([{ type: 'paragraph' as any, children: [{ text }] }]);
  }, [setDraft, text]);
  return null;
}

function ReplyObserver() {
  const reply = useAtomValue(roomIdToReplyDraftAtomFamily(room.roomId));
  return <div data-testid="reply-observer">{reply?.eventId ?? ''}</div>;
}

function UploadObserver() {
  const uploads = useAtomValue(roomIdToUploadItemsAtomFamily(room.roomId));
  return (
    <div data-testid="upload-observer">
      {JSON.stringify(
        uploads.map((upload) => ({
          encrypting: upload.encrypting,
          metadata: upload.metadata,
          body: upload.body,
        }))
      )}
    </div>
  );
}

const sendButton = () => screen.getByRole('button', { name: 'Send your composed Message' });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  testState.isMobile = false;
  testState.editorTriggerButtons = false;
  testState.pendingUploads = [];
  testState.sendIndividualAttachmentAsCaption = false;
  testState.encrypted = false;
  testState.handleFiles = undefined;
  testState.safeUploadFile.mockReset().mockImplementation(async (file: File) => file);
  testState.encryptFile.mockReset();
  testState.editingEvent = undefined;
  testState.accountPersonaSelection = undefined;
  testState.roomPersonaSelection = undefined;
  testState.matrix.sendMessage.mockReset().mockResolvedValue({ event_id: '$event' });
  testState.matrix.sendEvent.mockReset().mockResolvedValue({});
  testState.cancelDelayedEvent.mockReset();
  testState.sendDelayedMessage.mockReset();
});

describe('RoomInput submit regressions', () => {
  it('sends only once when submitted twice before the first send resolves', async () => {
    const send = deferred<{ event_id: string }>();
    testState.matrix.sendMessage.mockReturnValue(send.promise);
    render(<RoomInputHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare attachment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compose text' }));

    const submit = screen.getByRole('button', { name: 'Send your composed Message' });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledOnce());
    send.resolve({ event_id: '$event' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send your composed Message' })).toBeEnabled()
    );
  });

  it('sends a replied attachment once when a touch produces pointerup and click', async () => {
    const send = deferred<{ event_id: string }>();
    const file = new File(['attachment'], 'attachment.txt', { type: 'text/plain' });
    testState.isMobile = true;
    testState.sendIndividualAttachmentAsCaption = true;
    testState.pendingUploads = [{ status: 'success', file, mxc: 'mxc://example/attachment' }];
    testState.matrix.sendMessage.mockReturnValue(send.promise);
    render(<RoomInputHarness initialReply />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare attachment' }));

    const submit = sendButton();
    fireEvent.pointerDown(submit, { pointerType: 'touch' });
    fireEvent.pointerUp(submit, { pointerType: 'touch' });
    fireEvent.click(submit);

    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledOnce());
    expect(testState.matrix.sendMessage.mock.calls[0]?.[2]?.['m.relates_to']).toEqual(
      expect.objectContaining({ 'm.in_reply_to': expect.anything() })
    );
    send.resolve({ event_id: '$event' });
  });

  it('sends on touch pointerup when the tap never produces a click', async () => {
    render(<RoomInputHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Compose text' }));

    fireEvent.pointerDown(sendButton(), { pointerType: 'touch' });
    fireEvent.pointerUp(sendButton(), { pointerType: 'touch' });

    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledOnce());
  });

  it('sends once when a touch tap produces both a pointerup and a click', async () => {
    render(<RoomInputHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Compose text' }));

    const submit = sendButton();
    fireEvent.pointerDown(submit, { pointerType: 'touch' });
    fireEvent.pointerUp(submit, { pointerType: 'touch' });
    fireEvent.click(submit);

    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledOnce());
  });

  it('cancels a touch send released outside the button', () => {
    render(<RoomInputHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Compose text' }));

    fireEvent.pointerDown(sendButton(), { pointerType: 'touch' });
    fireEvent.pointerUp(sendButton(), { pointerType: 'touch', clientX: 200, clientY: 200 });

    expect(testState.matrix.sendMessage).not.toHaveBeenCalled();
  });

  it('leaves mouse taps on the click path', async () => {
    render(<RoomInputHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Compose text' }));

    const submit = sendButton();
    fireEvent.pointerDown(submit, { pointerType: 'mouse' });
    fireEvent.pointerUp(submit, { pointerType: 'mouse' });
    expect(testState.matrix.sendMessage).not.toHaveBeenCalled();

    fireEvent.click(submit);
    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledOnce());
  });

  it('waits for an attachment transaction instead of sending text independently', async () => {
    const upload = deferred<{ content_uri: string }>();
    const file = new File(['attachment'], 'attachment.txt', { type: 'text/plain' });
    testState.pendingUploads = [{ status: 'loading', file, promise: upload.promise }];

    render(<RoomInputHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare attachment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compose text' }));

    fireEvent.click(screen.getByRole('button', { name: 'Send your composed Message' }));
    expect(testState.matrix.sendMessage).not.toHaveBeenCalled();
    upload.resolve({ content_uri: 'mxc://example/attachment' });
    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledTimes(2));
    expect(testState.matrix.sendMessage.mock.calls[0]?.[2]?.body).toBe('attachment.txt');
    expect(testState.matrix.sendMessage.mock.calls[1]?.[2]?.body).toBe('retry me');
  });

  it('uses the active resolved persona for attachments and stickers', async () => {
    testState.accountPersonaSelection = {
      persona: { id: 'account', displayname: 'Account', trigger: { prefix: [] } },
    };
    testState.roomPersonaSelection = {
      persona: { id: 'expired-room', displayname: 'Expired', trigger: { prefix: [] } },
      validUntil: Date.now() - 1,
    };
    render(<RoomInputHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Prepare attachment' }));
    fireEvent.click(sendButton());
    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledOnce());
    expect(
      testState.matrix.sendMessage.mock.calls[0]?.[2]?.['com.beeper.per_message_profile']
    ).toMatchObject({
      id: 'account',
      displayname: 'Account',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select sticker' }));
    await waitFor(() => expect(testState.matrix.sendEvent).toHaveBeenCalledOnce());
    expect(
      testState.matrix.sendEvent.mock.calls[0]?.[2]?.['com.beeper.per_message_profile']
    ).toMatchObject({
      id: 'account',
      displayname: 'Account',
    });
  });

  it('keeps attachment retry locked until every sibling send settles', async () => {
    const delayedSecondSend = deferred<{ event_id: string }>();
    let sendNumber = 0;
    testState.matrix.sendMessage.mockImplementation(() => {
      sendNumber += 1;
      return sendNumber === 1
        ? Promise.reject(new Error('first attachment failed'))
        : delayedSecondSend.promise;
    });

    render(<RoomInputHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare two attachments' }));
    fireEvent.keyDown(screen.getByTestId('room-input-editor'), { key: 'Enter', code: 'Enter' });

    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledTimes(2));
    expect(sendButton()).toBeDisabled();
    fireEvent.click(sendButton());
    expect(testState.matrix.sendMessage).toHaveBeenCalledTimes(2);

    delayedSecondSend.resolve({ event_id: '$second' });
    await waitFor(() => expect(sendButton()).toBeEnabled());
    expect(testState.matrix.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('waits for all scheduled siblings before unlocking and does not re-cancel on retry', async () => {
    const delayedSecondSend = deferred<unknown>();
    let sendNumber = 0;
    testState.sendDelayedMessage.mockImplementation(() => {
      sendNumber += 1;
      if (sendNumber === 1) return Promise.reject(new Error('first scheduled send failed'));
      if (sendNumber === 2) return delayedSecondSend.promise;
      return Promise.resolve();
    });

    render(<RoomInputHarness scheduled />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare two attachments' }));
    fireEvent.keyDown(screen.getByTestId('room-input-editor'), { key: 'Enter', code: 'Enter' });

    await waitFor(() => expect(testState.sendDelayedMessage).toHaveBeenCalledTimes(2));
    expect(sendButton()).toBeDisabled();
    fireEvent.click(sendButton());
    expect(testState.sendDelayedMessage).toHaveBeenCalledTimes(2);

    delayedSecondSend.resolve(undefined);
    await waitFor(() => expect(sendButton()).toBeEnabled());
    expect(testState.cancelDelayedEvent).toHaveBeenCalledOnce();

    testState.pendingUploads = [testState.pendingUploads[0]];
    fireEvent.click(sendButton());
    await waitFor(() => expect(testState.sendDelayedMessage).toHaveBeenCalledTimes(3));
    expect(testState.cancelDelayedEvent).toHaveBeenCalledOnce();
  });

  it('routes delayed replacement sends through the room schedule coordinator', async () => {
    const runSpy = vi.spyOn(roomScheduleCoordinator, 'run');
    try {
      render(<RoomInputHarness scheduled />);
      fireEvent.click(screen.getByRole('button', { name: 'Prepare two attachments' }));
      fireEvent.keyDown(screen.getByTestId('room-input-editor'), { key: 'Enter', code: 'Enter' });

      await waitFor(() => expect(testState.sendDelayedMessage).toHaveBeenCalledTimes(2));
      expect(runSpy).toHaveBeenCalledWith(testState.matrix, room.roomId, expect.any(Function));
    } finally {
      runSpy.mockRestore();
    }
  });

  it('does not consume main-room scheduling state from a thread composer', async () => {
    render(<RoomInputHarness scheduled threadRootId="$thread" />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare two attachments' }));
    fireEvent.keyDown(screen.getByTestId('room-input-editor'), { key: 'Enter', code: 'Enter' });

    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledTimes(2));
    expect(testState.sendDelayedMessage).not.toHaveBeenCalled();
    expect(testState.cancelDelayedEvent).not.toHaveBeenCalled();
  });

  it('queues poll content behind a picker and applies reply semantics', async () => {
    const stickerSend = deferred<unknown>();
    testState.matrix.sendEvent.mockReturnValue(stickerSend.promise);
    render(<RoomInputHarness scheduled />);

    fireEvent.click(screen.getByRole('button', { name: 'Select sticker' }));
    await waitFor(() => expect(testState.matrix.sendEvent).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Select newer reply' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Poll' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit poll' }));

    expect(testState.matrix.sendEvent).toHaveBeenCalledOnce();
    stickerSend.resolve({});
    await waitFor(() => expect(testState.matrix.sendEvent).toHaveBeenCalledTimes(2));

    // A poll must go out as its own event type, not as an m.room.message.
    const pollCall = testState.matrix.sendEvent.mock.calls[1];
    expect(pollCall?.[2]).toBe(M_POLL_START.name);
    expect(pollCall?.[3]?.['m.relates_to']).toBeDefined();
    expect(testState.matrix.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps a reply through GIF command dispatch and claims it exactly once on selection', async () => {
    render(<RoomInputHarness initialReply />);
    render(<ReplyObserver />);

    fireEvent.click(screen.getByRole('button', { name: 'Compose GIF command' }));
    fireEvent.click(sendButton());

    await waitFor(() => expect(screen.getByTestId('reply-observer')).toHaveTextContent('$reply'));
    expect(testState.matrix.sendMessage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Select GIF' }));
    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledOnce());
    expect(testState.matrix.sendMessage.mock.calls[0]?.[2]?.['m.relates_to']).toBeDefined();
    expect(screen.getByTestId('reply-observer')).toHaveTextContent('');
  });

  it('restores a reply while a poll command is pending, including cancellation and retry', async () => {
    render(<RoomInputHarness initialReply />);
    render(<ReplyObserver />);

    fireEvent.click(screen.getByRole('button', { name: 'Compose poll command' }));
    fireEvent.click(sendButton());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Cancel poll' })).toBeInTheDocument()
    );
    await waitFor(() => expect(screen.getByTestId('reply-observer')).toHaveTextContent('$reply'));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel poll' }));
    expect(testState.matrix.sendEvent).not.toHaveBeenCalled();
    expect(screen.getByTestId('reply-observer')).toHaveTextContent('$reply');

    fireEvent.click(screen.getByRole('button', { name: 'Compose poll command' }));
    fireEvent.click(sendButton());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Submit poll' })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Submit poll' }));

    await waitFor(() => expect(testState.matrix.sendEvent).toHaveBeenCalledOnce());
    expect(testState.matrix.sendEvent.mock.calls[0]?.[3]?.['m.relates_to']).toBeDefined();
    expect(screen.getByTestId('reply-observer')).toHaveTextContent('');
  });

  it('keeps a thread reply through an empty location command until submission', async () => {
    render(<RoomInputHarness initialReply threadRootId="$thread" />);

    fireEvent.click(screen.getByRole('button', { name: 'Compose location command' }));
    fireEvent.click(sendButton());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Submit location' })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Submit location' }));

    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledOnce());
    expect(testState.matrix.sendMessage).toHaveBeenCalledWith(
      room.roomId,
      '$thread',
      expect.objectContaining({ 'm.relates_to': expect.anything() })
    );
  });

  it('keeps the location dialog open when the queued send rejects', async () => {
    testState.matrix.sendMessage.mockRejectedValueOnce(new Error('send failed'));
    render(<RoomInputHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Location' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Submit location' })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Submit location' }));

    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledOnce());
    expect(screen.getByTestId('location-submit-failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit location' })).toBeInTheDocument();
  });

  it('clears the composer on a failed immediate send, leaving retry to the local echo', async () => {
    // A rejected mx.sendMessage leaves a NOT_SENT local echo in the timeline with resend
    // and delete affordances, so putting the text back would duplicate the message.
    testState.matrix.sendMessage.mockRejectedValueOnce(new Error('send failed'));
    render(<RoomInputHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Compose text' }));

    fireEvent.click(sendButton());
    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByTestId('room-input-editor')).toHaveAttribute('data-editor-text', '')
    );
  });

  it('keeps the composer focused after sending a text message', async () => {
    render(<RoomInputHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Compose text' }));
    screen.getByTestId('room-input-editor').focus();

    fireEvent.keyDown(screen.getByTestId('room-input-editor'), { key: 'Enter', code: 'Enter' });

    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledOnce());
    expect(document.activeElement).toBe(screen.getByTestId('room-input-editor'));
  });

  it('clears the composer when a message is sent', async () => {
    const clearSpy = vi.spyOn(ProseMirrorEditorController.prototype, 'clear');
    try {
      render(<RoomInputHarness />);
      fireEvent.click(screen.getByRole('button', { name: 'Compose text' }));

      fireEvent.click(sendButton());
      await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledOnce());

      expect(clearSpy).toHaveBeenCalled();
    } finally {
      clearSpy.mockRestore();
    }
  });

  it('keeps the composer focused when a reply is claimed by sending', async () => {
    render(<RoomInputHarness initialReply />);
    fireEvent.click(screen.getByRole('button', { name: 'Compose text' }));
    screen.getByTestId('room-input-editor').focus();
    fireEvent.keyDown(screen.getByTestId('room-input-editor'), { key: 'Enter', code: 'Enter' });

    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledOnce());
    expect(document.activeElement).toBe(screen.getByTestId('room-input-editor'));
  });

  it('keeps the composer focused when cancelling a reply on desktop', async () => {
    render(<RoomInputHarness initialReply />);
    screen.getByTestId('room-input-editor').focus();

    fireEvent.keyDown(screen.getByTestId('room-input-editor'), { key: 'Escape', code: 'Escape' });
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    expect(document.activeElement).toBe(screen.getByTestId('room-input-editor'));
  });

  it('blurs the composer when cancelling a reply on mobile to dismiss the keyboard', async () => {
    testState.isMobile = true;
    render(<RoomInputHarness initialReply />);
    screen.getByTestId('room-input-editor').focus();

    fireEvent.keyDown(screen.getByTestId('room-input-editor'), { key: 'Escape', code: 'Escape' });
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    expect(document.activeElement).not.toBe(screen.getByTestId('room-input-editor'));
  });

  it('restores composed text when a scheduled send fails', async () => {
    // Delayed events produce no local echo, so the composer is the only way back.
    testState.sendDelayedMessage.mockRejectedValueOnce(new Error('schedule failed'));
    render(<RoomInputHarness scheduledText />);
    fireEvent.click(screen.getByRole('button', { name: 'Compose text' }));

    fireEvent.click(sendButton());
    await waitFor(() => expect(testState.sendDelayedMessage).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByTestId('room-input-editor')).toHaveAttribute(
        'data-editor-text',
        'retry me'
      )
    );
  });

  it('keeps text typed while a send is in flight', async () => {
    const send = deferred<{ event_id: string }>();
    testState.matrix.sendMessage.mockReturnValue(send.promise);
    render(<RoomInputHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Compose text' }));
    const submit = screen.getByRole('button', { name: 'Send your composed Message' });

    fireEvent.click(submit);
    fireEvent.click(screen.getByRole('button', { name: 'Compose updated text' }));
    send.resolve({ event_id: '$event' });

    await waitFor(() =>
      expect(screen.getByTestId('room-input-editor')).toHaveAttribute(
        'data-editor-text',
        'updated while sending'
      )
    );
  });

  it('queues a second text message while the first send is in flight', async () => {
    const firstSend = deferred<{ event_id: string }>();
    testState.matrix.sendMessage.mockReturnValueOnce(firstSend.promise);
    render(<RoomInputHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Compose text' }));

    fireEvent.click(sendButton());
    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledOnce());
    expect(sendButton()).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Compose updated text' }));
    fireEvent.click(sendButton());
    firstSend.resolve({ event_id: '$first' });

    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledTimes(2));
    expect(testState.matrix.sendMessage.mock.calls[0]?.[2]?.body).toBe('retry me');
    expect(testState.matrix.sendMessage.mock.calls[1]?.[2]?.body).toBe('updated while sending');
  });

  it('blocks submission while file preprocessing is pending', async () => {
    const preprocessing = deferred<File>();
    const file = new File(['attachment'], 'attachment.txt', { type: 'text/plain' });
    testState.safeUploadFile.mockReturnValue(preprocessing.promise);
    render(<RoomInputHarness />);

    void testState.handleFiles?.([file]);
    await waitFor(() => expect(testState.safeUploadFile).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Compose text' }));
    const submit = screen.getByRole('button', { name: 'Send your composed Message' });

    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(testState.matrix.sendMessage).not.toHaveBeenCalled();

    preprocessing.resolve(file);
  });

  it('uses the queued Enter snapshot after a slow sticker send', async () => {
    const stickerSend = deferred<unknown>();
    testState.matrix.sendEvent.mockReturnValue(stickerSend.promise);
    render(<RoomInputHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Select sticker' }));
    await waitFor(() => expect(testState.matrix.sendEvent).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Compose text' }));
    fireEvent.keyDown(screen.getByTestId('room-input-editor'), { key: 'Enter', code: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Compose updated text' }));

    stickerSend.resolve({});
    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledOnce());
    expect(testState.matrix.sendMessage.mock.calls[0]?.[2]?.body).toBe('retry me');
  });

  it('gives a claimed reply only to the slow sticker, not queued Enter', async () => {
    const stickerSend = deferred<unknown>();
    testState.matrix.sendEvent.mockReturnValue(stickerSend.promise);
    render(<RoomInputHarness initialReply />);

    fireEvent.click(screen.getByRole('button', { name: 'Select sticker' }));
    await waitFor(() => expect(testState.matrix.sendEvent).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Compose text' }));
    fireEvent.keyDown(screen.getByTestId('room-input-editor'), { key: 'Enter', code: 'Enter' });

    stickerSend.resolve({});
    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledOnce());
    expect(testState.matrix.sendEvent.mock.calls[0]?.[2]?.['m.relates_to']).toBeDefined();
    expect(testState.matrix.sendMessage.mock.calls[0]?.[2]?.['m.relates_to']).toBeUndefined();
  });

  it('preserves a newer reply selected during a slow sticker send', async () => {
    const stickerSend = deferred<unknown>();
    testState.matrix.sendEvent.mockReturnValue(stickerSend.promise);
    render(<RoomInputHarness initialReply />);
    render(<ReplyObserver />);

    fireEvent.click(screen.getByRole('button', { name: 'Select sticker' }));
    await waitFor(() => expect(testState.matrix.sendEvent).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Select newer reply' }));
    await waitFor(() =>
      expect(screen.getByTestId('reply-observer')).toHaveTextContent('$new-reply')
    );

    stickerSend.resolve({});
    await waitFor(() => expect(testState.matrix.sendEvent).toHaveBeenCalledOnce());
    expect(testState.matrix.sendEvent.mock.calls[0]?.[2]?.['m.relates_to']).toBeDefined();
    expect(screen.getByTestId('reply-observer')).toHaveTextContent('$new-reply');
  });

  it('resets after a selection-only editor change', async () => {
    const send = deferred<{ event_id: string }>();
    testState.matrix.sendMessage.mockReturnValue(send.promise);
    render(<RoomInputHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Compose text' }));
    const submit = screen.getByRole('button', { name: 'Send your composed Message' });

    fireEvent.click(submit);
    fireEvent.input(screen.getByTestId('room-input-editor'));
    send.resolve({ event_id: '$event' });

    await waitFor(() =>
      expect(screen.getByTestId('room-input-editor')).toHaveAttribute('data-editor-text', '')
    );
  });

  it('keeps an updated attachment caption after the upload completes', async () => {
    const upload = deferred<{ content_uri: string }>();
    const file = new File(['attachment'], 'attachment.txt', { type: 'text/plain' });
    testState.sendIndividualAttachmentAsCaption = true;
    testState.pendingUploads = [{ status: 'loading', file, promise: upload.promise }];
    testState.matrix.sendMessage.mockResolvedValue({ event_id: '$event' });

    render(<RoomInputHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare attachment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compose text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send your composed Message' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compose updated text' }));

    upload.resolve({ content_uri: 'mxc://example/attachment' });
    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledOnce());
    expect(testState.matrix.sendMessage.mock.calls[0]?.[2]?.body).toBe('retry me');
    expect(screen.getByTestId('room-input-editor')).toHaveAttribute(
      'data-editor-text',
      'updated while sending'
    );
  });

  it('finishes encryption after metadata replacement using the stable original file', async () => {
    const encryption = deferred<{ file: File; originalFile: File; encInfo: object }>();
    const file = new File(['attachment'], 'attachment.txt', { type: 'text/plain' });
    testState.encrypted = true;
    testState.encryptFile.mockReturnValue(encryption.promise);

    render(<RoomInputHarness />);
    render(<UploadObserver />);
    await act(async () => {
      void testState.handleFiles?.([file]);
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId('upload-observer')).toHaveTextContent('true'));
    fireEvent.click(screen.getByRole('button', { name: 'Update attachment metadata' }));
    await act(async () => {
      encryption.resolve({
        file: new File(['encrypted'], 'attachment.txt', { type: 'text/plain' }),
        originalFile: file,
        encInfo: {},
      });
      await encryption.promise;
    });

    await waitFor(() => expect(screen.getByTestId('upload-observer')).toHaveTextContent('false'));
    expect(screen.getByTestId('upload-observer')).toHaveTextContent('"markedAsSpoiler":true');
  });

  it('removes the current replaced item when encryption fails', async () => {
    const encryption = deferred<never>();
    const file = new File(['attachment'], 'attachment.txt', { type: 'text/plain' });
    testState.encrypted = true;
    testState.encryptFile.mockReturnValue(encryption.promise);

    render(<RoomInputHarness />);
    render(<UploadObserver />);
    await act(async () => {
      void testState.handleFiles?.([file]);
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId('upload-observer')).toHaveTextContent('true'));
    fireEvent.click(screen.getByRole('button', { name: 'Update attachment metadata' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update attachment description' }));
    await waitFor(() =>
      expect(screen.getByTestId('upload-observer')).toHaveTextContent('updated description')
    );
    await act(async () => {
      encryption.reject(new Error('encryption failed'));
      await encryption.promise.catch(() => undefined);
    });

    await waitFor(() => expect(screen.getByTestId('upload-observer')).toHaveTextContent('[]'));
    expect(screen.getByTestId('upload-observer')).not.toHaveTextContent('encrypting');
  });

  it('uses the submitted editor snapshot for an attachment reply relation', async () => {
    const upload = deferred<{ content_uri: string }>();
    const file = new File(['attachment'], 'attachment.txt', { type: 'text/plain' });
    testState.pendingUploads = [{ status: 'loading', file, promise: upload.promise }];

    const seed = render(<DraftSetter text="" />);
    seed.unmount();
    render(<RoomInputHarness initialReply />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare attachment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send your composed Message' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compose updated text' }));
    upload.resolve({ content_uri: 'mxc://example/attachment' });

    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledOnce());
    expect(testState.matrix.sendMessage.mock.calls[0]?.[2]?.['m.relates_to']).toEqual(
      expect.objectContaining({ 'm.in_reply_to': expect.anything() })
    );
  });

  it('leaves only the emoji trigger once text is composed on mobile', () => {
    testState.isMobile = true;
    testState.editorTriggerButtons = true;
    render(<RoomInputHarness />);

    expect(screen.getByRole('button', { name: 'Open gif picker' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open sticker picker' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Compose text' }));

    expect(screen.queryByRole('button', { name: 'Open gif picker' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open sticker picker' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open emoji board' })).toBeInTheDocument();
  });

  it('keeps every trigger while composing on desktop', () => {
    testState.editorTriggerButtons = true;
    render(<RoomInputHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Compose text' }));

    expect(screen.getByRole('button', { name: 'Open gif picker' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open sticker picker' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open emoji board' })).toBeInTheDocument();
  });

  it('blurs the editor when opening the emoji board on mobile to dismiss the keyboard', () => {
    testState.isMobile = true;
    testState.editorTriggerButtons = true;
    render(<RoomInputHarness />);
    const editor = screen.getByTestId('room-input-editor');
    editor.focus();
    expect(document.activeElement).toBe(editor);

    fireEvent.click(screen.getByRole('button', { name: 'Open emoji board' }));

    expect(document.activeElement).not.toBe(editor);
  });

  it('blurs the editor when opening the attachment sheet on mobile to dismiss the keyboard', () => {
    testState.isMobile = true;
    render(<RoomInputHarness />);
    const editor = screen.getByTestId('room-input-editor');
    editor.focus();
    expect(document.activeElement).toBe(editor);

    fireEvent.click(screen.getByRole('button', { name: 'Add new Item' }));

    expect(document.activeElement).not.toBe(editor);
  });

  it('does not refocus the editor when the emoji sheet closes on mobile', () => {
    testState.isMobile = true;
    testState.editorTriggerButtons = true;
    render(<RoomInputHarness />);
    const editor = screen.getByTestId('room-input-editor');
    editor.focus();

    const activeElement = vi
      .spyOn(Object.getPrototypeOf(document), 'activeElement', 'get')
      .mockReturnValue(editor);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Open emoji board' }));
      fireEvent.click(screen.getByRole('button', { name: 'Open emoji board' }));
    } finally {
      activeElement.mockRestore();
    }

    expect(document.activeElement).not.toBe(editor);
  });

  it('keeps an unsent draft across a composer remount', async () => {
    const input = render(<RoomInputHarness />);
    render(<DraftObserver />);
    fireEvent.click(screen.getByRole('button', { name: 'Compose text' }));

    input.unmount();
    expect(screen.getByTestId('draft-observer')).toHaveTextContent('retry me');

    render(<RoomInputHarness />);

    expect(screen.getByTestId('room-input-editor')).toHaveAttribute('data-editor-text', 'retry me');
  });

  it('drops the persisted draft when its message is sent', async () => {
    const seed = render(<DraftSetter text="draft to send" />);
    seed.unmount();
    render(<RoomInputHarness initialDraft="draft to send" />);
    render(<DraftObserver />);

    await waitFor(() =>
      expect(screen.getByTestId('room-input-editor')).toHaveAttribute(
        'data-editor-text',
        'draft to send'
      )
    );

    fireEvent.keyDown(screen.getByTestId('room-input-editor'), { key: 'Enter', code: 'Enter' });

    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledOnce());
    expect(screen.getByTestId('draft-observer')).toBeEmptyDOMElement();
  });

  it('preserves the normal draft when an edited message input unmounts', async () => {
    testState.isMobile = true;
    testState.editingEvent = {
      getId: () => '$original',
      getContent: () => ({ body: 'original', msgtype: 'm.text' }),
    };
    const seed = render(<DraftSetter text="keep this draft" />);
    seed.unmount();
    const input = render(<RoomInputHarness editId="$original" initialDraft="keep this draft" />);
    render(<DraftObserver />);

    await waitFor(() => expect(screen.getByTestId('room-input-editor')).toBeInTheDocument());
    input.unmount();

    expect(screen.getByTestId('draft-observer')).toHaveTextContent('keep this draft');
  });

  it('does not submit mobile edits before initialization, then sends the replacement', async () => {
    testState.isMobile = true;
    testState.editingEvent = {
      getId: () => '$original',
      getContent: () => ({ body: 'original', msgtype: 'm.text' }),
    };
    const onCancelEdit = vi.fn();
    render(<RoomInputHarness editId="$original" onCancelEdit={onCancelEdit} />);

    expect(testState.matrix.sendMessage).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('room-input-editor')).toBeInTheDocument());
    fireEvent.input(screen.getByTestId('room-input-editor'));
    fireEvent.click(screen.getByRole('button', { name: 'Send your composed Message' }));

    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledOnce());
    expect(testState.matrix.sendMessage).toHaveBeenCalledWith(
      room.roomId,
      expect.objectContaining({
        body: '* original',
        'm.new_content': expect.objectContaining({ body: 'original' }),
        'm.relates_to': expect.anything(),
      })
    );
    expect(onCancelEdit).toHaveBeenCalledOnce();
  });

  it('sends a mobile edit as a replacement, not a reply, when a reply draft exists', async () => {
    testState.isMobile = true;
    testState.editingEvent = {
      getId: () => '$original',
      getContent: () => ({ body: 'original', msgtype: 'm.text' }),
    };
    const onCancelEdit = vi.fn();
    render(<RoomInputHarness editId="$original" onCancelEdit={onCancelEdit} initialReply />);

    await waitFor(() => expect(screen.getByTestId('room-input-editor')).toBeInTheDocument());
    fireEvent.input(screen.getByTestId('room-input-editor'));
    fireEvent.click(screen.getByRole('button', { name: 'Send your composed Message' }));

    await waitFor(() => expect(testState.matrix.sendMessage).toHaveBeenCalledOnce());
    const sentContent = testState.matrix.sendMessage.mock.calls[0]![1];
    expect(sentContent['m.relates_to']).toEqual(expect.objectContaining({ rel_type: 'm.replace' }));
    expect(sentContent['m.relates_to']).not.toHaveProperty('m.in_reply_to');
    expect(onCancelEdit).toHaveBeenCalledOnce();
  });
});
