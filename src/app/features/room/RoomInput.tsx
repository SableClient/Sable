import {
  forwardRef,
  KeyboardEventHandler,
  MouseEvent,
  RefObject,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { isKeyHotkey } from 'is-hotkey';
import {
  EventType,
  IContent,
  MsgType,
  RelationType,
  Room,
  IEventRelation,
  StickerEventContent,
} from '$types/matrix-sdk';
import { ReactEditor } from 'slate-react';
import { Editor, Point, Range, Transforms } from 'slate';
import {
  Box,
  config,
  Dialog,
  Icon,
  IconButton,
  Icons,
  Line,
  Menu,
  MenuItem,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  PopOut,
  RectCords,
  Scroll,
  Text,
  toRem,
} from 'folds';

import parse from 'html-react-parser';
import {
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  scaleSystemEmoji,
} from '$plugins/react-custom-html-parser';

import { useMatrixClient } from '$hooks/useMatrixClient';
import {
  AutocompletePrefix,
  AutocompleteQuery,
  createEmoticonElement,
  CustomEditor,
  customHtmlEqualsPlainText,
  getAutocompleteQuery,
  getPrevWorldRange,
  resetEditor,
  RoomMentionAutocomplete,
  toMatrixCustomHTML,
  Toolbar,
  toPlainText,
  trimCustomHtml,
  UserMentionAutocomplete,
  EmoticonAutocomplete,
  moveCursor,
  resetEditorHistory,
  isEmptyEditor,
  getBeginCommand,
  trimCommand,
  getMentions,
  ANYWHERE_AUTOCOMPLETE_PREFIXES,
  BEGINNING_AUTOCOMPLETE_PREFIXES,
} from '$components/editor';
import { EmojiBoard, EmojiBoardTab } from '$components/emoji-board';
import { UseStateProvider } from '$components/UseStateProvider';
import {
  TUploadContent,
  encryptFile,
  getImageInfo,
  getMxIdLocalPart,
  mxcUrlToHttp,
  toggleReaction,
} from '$utils/matrix';
import { useTypingStatusUpdater } from '$hooks/useTypingStatusUpdater';
import { useFilePicker } from '$hooks/useFilePicker';
import { useFilePasteHandler } from '$hooks/useFilePasteHandler';
import { useFileDropZone } from '$hooks/useFileDrop';
import {
  roomIdToMsgDraftAtomFamily,
  roomIdToReplyDraftAtomFamily,
  roomIdToUploadItemsAtomFamily,
  roomUploadAtomFamily,
  TUploadItem,
  TUploadMetadata,
  IReplyDraft,
} from '$state/room/roomInputDrafts';
import { UploadCardRenderer } from '$components/upload-card';
import {
  UploadBoard,
  UploadBoardContent,
  UploadBoardHeader,
  UploadBoardImperativeHandlers,
} from '$components/upload-board';
import { Upload, UploadStatus, UploadSuccess, createUploadFamilyObserverAtom } from '$state/upload';
import { getImageUrlBlob, loadImageElement } from '$utils/dom';
import { safeFile } from '$utils/mimeTypes';
import { fulfilledPromiseSettledResult } from '$utils/common';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import {
  getMemberDisplayName,
  getMentionContent,
  trimReplyFromBody,
  trimReplyFromFormattedBody,
} from '$utils/room';
import { Command, SHRUG, TABLEFLIP, UNFLIP, useCommands } from '$hooks/useCommands';
import { mobileOrTablet } from '$utils/user-agent';
import { useElementSizeObserver } from '$hooks/useElementSizeObserver';
import { ReplyLayout, ThreadIndicator } from '$components/message';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { nicknamesAtom } from '$state/nicknames';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useImagePackRooms } from '$hooks/useImagePackRooms';
import { useComposingCheck } from '$hooks/useComposingCheck';
import { useSableCosmetics } from '$hooks/useSableCosmetics';
import { createLogger } from '$utils/debug';
import FocusTrap from 'focus-trap-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  delayedEventsSupportedAtom,
  roomIdToScheduledTimeAtomFamily,
  roomIdToEditingScheduledDelayIdAtomFamily,
} from '$state/scheduledMessages';
import {
  sendDelayedMessage,
  sendDelayedMessageE2EE,
  computeDelayMs,
  cancelDelayedEvent,
} from '$utils/delayedEvents';
import { timeHourMinute, timeDayMonthYear } from '$utils/time';
import { stopPropagation } from '$utils/keyboard';
import { MessageEvent } from '$types/matrix/room';
import { usePowerLevelsContext } from '$hooks/usePowerLevels';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { AutocompleteNotice } from '$components/editor/autocomplete/AutocompleteNotice';
import { SchedulePickerDialog } from './schedule-send';
import * as css from './schedule-send/SchedulePickerDialog.css';
import {
  getAudioMsgContent,
  getFileMsgContent,
  getImageMsgContent,
  getVideoMsgContent,
} from './msgContent';
import { CommandAutocomplete } from './CommandAutocomplete';

const getReplyContent = (replyDraft: IReplyDraft | undefined): IEventRelation => {
  if (!replyDraft) return {};

  const relatesTo: IEventRelation = {};

  relatesTo['m.in_reply_to'] = {
    event_id: replyDraft.eventId,
  };

  if (replyDraft.relation?.rel_type === RelationType.Thread) {
    relatesTo.event_id = replyDraft.relation.event_id;
    relatesTo.rel_type = RelationType.Thread;
    relatesTo.is_falling_back = false;
  }
  return relatesTo;
};

const log = createLogger('RoomInput');
interface ReplyEventContent {
  'm.relates_to'?: IEventRelation;
}

interface RoomInputProps {
  editor: Editor;
  fileDropContainerRef: RefObject<HTMLElement>;
  roomId: string;
  room: Room;
}
export const RoomInput = forwardRef<HTMLDivElement, RoomInputProps>(
  ({ editor, fileDropContainerRef, roomId, room }, ref) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const [enterForNewline] = useSetting(settingsAtom, 'enterForNewline');
    const [isMarkdown] = useSetting(settingsAtom, 'isMarkdown');
    const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
    const commands = useCommands(mx, room);
    const emojiBtnRef = useRef<HTMLButtonElement>(null);
    const roomToParents = useAtomValue(roomToParentsAtom);
    const nicknames = useAtomValue(nicknamesAtom);

    const powerLevels = usePowerLevelsContext();
    const creators = useRoomCreators(room);
    const permissions = useRoomPermissions(creators, powerLevels);
    const canSendReaction = permissions.event(MessageEvent.Reaction, mx.getSafeUserId());

    const [msgDraft, setMsgDraft] = useAtom(roomIdToMsgDraftAtomFamily(roomId));
    const [replyDraft, setReplyDraft] = useAtom(roomIdToReplyDraftAtomFamily(roomId));
    const replyUserID = replyDraft?.userId;

    const { color: replyUsernameColor, font: replyUsernameFont } = useSableCosmetics(
      replyUserID ?? '',
      room
    );

    const [uploadBoard, setUploadBoard] = useState(true);
    const [selectedFiles, setSelectedFiles] = useAtom(roomIdToUploadItemsAtomFamily(roomId));
    const uploadFamilyObserverAtom = createUploadFamilyObserverAtom(
      roomUploadAtomFamily,
      selectedFiles.map((f) => f.file)
    );
    const uploadBoardHandlers = useRef<UploadBoardImperativeHandlers>();
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLongPress = useRef(false);

    const imagePackRooms: Room[] = useImagePackRooms(roomId, roomToParents);

    const [toolbar, setToolbar] = useSetting(settingsAtom, 'editorToolbar');
    const [autocompleteQuery, setAutocompleteQuery] =
      useState<AutocompleteQuery<AutocompletePrefix>>();
    const [isQuickTextReact, setQuickTextReact] = useState(false);

    const sendTypingStatus = useTypingStatusUpdater(mx, roomId);

    const [inputKey, setInputKey] = useState(0);

    const handleFiles = useCallback(
      async (files: File[]) => {
        setUploadBoard(true);
        const safeFiles = files.map(safeFile);
        const fileItems: TUploadItem[] = [];

        if (room.hasEncryptionStateEvent()) {
          const encryptFiles = fulfilledPromiseSettledResult(
            await Promise.allSettled(safeFiles.map((f) => encryptFile(f)))
          );
          encryptFiles.forEach((ef) =>
            fileItems.push({
              ...ef,
              metadata: {
                markedAsSpoiler: false,
              },
            })
          );
        } else {
          safeFiles.forEach((f) =>
            fileItems.push({
              file: f,
              originalFile: f,
              encInfo: undefined,
              metadata: {
                markedAsSpoiler: false,
              },
            })
          );
        }
        setSelectedFiles({
          type: 'PUT',
          item: fileItems,
        });
      },
      [setSelectedFiles, room]
    );
    const pickFile = useFilePicker(handleFiles, true);
    const handlePaste = useFilePasteHandler(handleFiles);
    const dropZoneVisible = useFileDropZone(fileDropContainerRef, handleFiles);
    const [hideStickerBtn, setHideStickerBtn] = useState(document.body.clientWidth < 500);

    const isComposing = useComposingCheck();

    const queryClient = useQueryClient();
    const delayedEventsSupported = useAtomValue(delayedEventsSupportedAtom);
    const [scheduledTime, setScheduledTime] = useAtom(roomIdToScheduledTimeAtomFamily(roomId));
    const [editingScheduledDelayId, setEditingScheduledDelayId] = useAtom(
      roomIdToEditingScheduledDelayIdAtomFamily(roomId)
    );
    const [scheduleMenuAnchor, setScheduleMenuAnchor] = useState<RectCords>();
    const [showSchedulePicker, setShowSchedulePicker] = useState(false);
    const [silentReply, setSilentReply] = useState(false);
    const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
    const isEncrypted = room.hasEncryptionStateEvent();

    useElementSizeObserver(
      useCallback(() => fileDropContainerRef.current, [fileDropContainerRef]),
      useCallback((width) => setHideStickerBtn(width < 500), [])
    );

    const replyEvent = replyDraft ? room.findEventById(replyDraft.eventId) : undefined;
    const {
      body: replyBody,
      formatted_body: replyFormattedBody,
      format: replyFormat,
    } = replyEvent?.getContent() ?? {};

    // Prefer the live event content; fall back to what was snapshotted in the
    // draft when the user hit Reply (the event may not be in SDK state if it
    // was redacted or evicted, but the draft always carries the original body).
    const htmlBody =
      replyFormat === 'org.matrix.custom.html' ? replyFormattedBody : replyDraft?.formattedBody;
    const plainBody = replyBody ?? replyDraft?.body;

    let replyBodyJSX: ReactNode = replyDraft ? trimReplyFromBody(replyDraft.body) : null;

    if (htmlBody) {
      const strippedHtml = trimReplyFromFormattedBody(htmlBody)
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<\/p>\s*<p[^>]*>/gi, ' ')
        .replace(/<\/?p[^>]*>/gi, '')
        .replace(/(?:\r\n|\r|\n)/g, ' ');
      const parserOpts = getReactCustomHtmlParser(mx, roomId, {
        linkifyOpts: LINKIFY_OPTS,
        useAuthentication,
        nicknames,
      });
      replyBodyJSX = parse(strippedHtml, parserOpts);
    } else if (plainBody) {
      const strippedBody = trimReplyFromBody(plainBody).replace(/(?:\r\n|\r|\n)/g, ' ');
      replyBodyJSX = scaleSystemEmoji(strippedBody);
    }

    useEffect(() => {
      Transforms.insertFragment(editor, msgDraft);
    }, [editor, msgDraft]);

    useEffect(
      () => () => {
        if (!isEmptyEditor(editor)) {
          const parsedDraft = JSON.parse(JSON.stringify(editor.children));
          setMsgDraft(parsedDraft);
        } else {
          setMsgDraft([]);
        }
        resetEditor(editor);
        resetEditorHistory(editor);
      },
      [roomId, editor, setMsgDraft]
    );

    useEffect(() => {
      if (replyDraft !== undefined) {
        setSilentReply(replyDraft.userId === mx.getUserId());
      }
    }, [mx, replyDraft]);

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

    const handleCancelUpload = (uploads: Upload[]) => {
      uploads.forEach((upload) => {
        if (upload.status === UploadStatus.Loading) {
          mx.cancelUpload(upload.promise);
        }
      });
      handleRemoveUpload(uploads.map((upload) => upload.file));
    };

    const handleSendUpload = async (uploads: UploadSuccess[]) => {
      const plainText = toPlainText(editor.children, isMarkdown).trim();

      const contentsPromises = uploads.map(async (upload) => {
        const fileItem = selectedFiles.find((f) => f.file === upload.file);
        if (!fileItem) throw new Error('Broken upload');

        if (fileItem.file.type.startsWith('image')) {
          return getImageMsgContent(mx, fileItem, upload.mxc);
        }
        if (fileItem.file.type.startsWith('video')) {
          return getVideoMsgContent(mx, fileItem, upload.mxc);
        }
        if (fileItem.file.type.startsWith('audio')) {
          return getAudioMsgContent(fileItem, upload.mxc);
        }
        return getFileMsgContent(fileItem, upload.mxc);
      });
      handleCancelUpload(uploads);
      const contents = fulfilledPromiseSettledResult(await Promise.allSettled(contentsPromises));

      if (contents.length > 0) {
        const replyContent = plainText?.length === 0 ? getReplyContent(replyDraft) : undefined;
        if (replyContent) contents[0]['m.relates_to'] = replyContent;
        setReplyDraft(undefined);
      }

      await Promise.all(
        contents.map((content) =>
          mx.sendMessage(roomId, content as any).catch((error: unknown) => {
            log.error('failed to send uploaded message', { roomId }, error);
            throw error;
          })
        )
      );
    };

    const handleCloseAutocomplete = useCallback(() => {
      setAutocompleteQuery(undefined);
      ReactEditor.focus(editor);
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
                  MessageEvent.RoomMessage,
                  MessageEvent.RoomMessageEncrypted,
                  MessageEvent.Sticker,
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
      uploadBoardHandlers.current?.handleSend();

      const commandName = getBeginCommand(editor);
      let plainText = toPlainText(editor.children, isMarkdown).trim();
      let customHtml = trimCustomHtml(
        toMatrixCustomHTML(editor.children, {
          allowTextFormatting: true,
          allowBlockMarkdown: isMarkdown,
          allowInlineMarkdown: isMarkdown,
        })
      );
      let msgType = MsgType.Text;

      // quick text react
      if (canSendReaction && plainText.startsWith('+#')) {
        handleQuickReact(plainText.substring(2));
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
        const commandContent = commands[commandName as Command];
        if (commandContent) {
          commandContent.exe(plainText, customHtml);
        }
        resetEditor(editor);
        resetEditorHistory(editor);
        sendTypingStatus(false);

        return;
      }

      if (plainText === '') return;

      const body = plainText;
      const formattedBody = customHtml;
      const mentionData = getMentions(mx, roomId, editor);

      const content: IContent = {
        msgtype: msgType,
        body,
      };

      if (replyDraft && !silentReply) {
        mentionData.users.add(replyDraft.userId);
      }

      content['m.mentions'] = getMentionContent(Array.from(mentionData.users), mentionData.room);

      if (replyDraft || !customHtmlEqualsPlainText(formattedBody, body)) {
        content.format = 'org.matrix.custom.html';
        content.formatted_body = formattedBody;
      }
      if (replyDraft) {
        content['m.relates_to'] = getReplyContent(replyDraft);
      }
      const invalidate = () =>
        queryClient.invalidateQueries({ queryKey: ['delayedEvents', roomId] });

      const resetInput = () => {
        resetEditor(editor);
        resetEditorHistory(editor);
        setInputKey((prev) => prev + 1);
        setReplyDraft(undefined);
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
            await sendDelayedMessage(mx, roomId, content, delayMs);
          }
          invalidate();
          setEditingScheduledDelayId(null);
          setScheduledTime(null);
          resetInput();
        } catch {
          // Network/server error — leave editor and scheduled state intact for retry
        }
      } else if (editingScheduledDelayId) {
        try {
          await cancelDelayedEvent(mx, editingScheduledDelayId);
          mx.sendMessage(roomId, content as any);
          invalidate();
          setEditingScheduledDelayId(null);
          resetInput();
        } catch {
          // Cancel failed — leave state intact for retry
        }
      } else {
        resetInput();
        mx.sendMessage(roomId, content as any).catch((error: unknown) => {
          log.error('failed to send message', { roomId }, error);
        });
      }
    }, [
      editor,
      isMarkdown,
      canSendReaction,
      mx,
      roomId,
      replyDraft,
      silentReply,
      scheduledTime,
      editingScheduledDelayId,
      handleQuickReact,
      commands,
      sendTypingStatus,
      queryClient,
      setReplyDraft,
      isEncrypted,
      setEditingScheduledDelayId,
      setScheduledTime,
      room,
    ]);

    const handleKeyDown: KeyboardEventHandler = useCallback(
      (evt) => {
        if (
          (isKeyHotkey('mod+enter', evt) || (!enterForNewline && isKeyHotkey('enter', evt))) &&
          !isComposing(evt)
        ) {
          evt.preventDefault();
          submit().catch((error) => {
            log.error('submit failed', { roomId }, error);
          });
        }
        if (isKeyHotkey('escape', evt)) {
          evt.preventDefault();
          if (autocompleteQuery) {
            setAutocompleteQuery(undefined);
            return;
          }
          setReplyDraft(undefined);
        }
      },
      [submit, roomId, setReplyDraft, enterForNewline, autocompleteQuery, isComposing]
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

    const handleEmoticonSelect = (key: string, shortcode: string) => {
      editor.insertNode(createEmoticonElement(key, shortcode));
      moveCursor(editor);
    };

    const handleStickerSelect = async (mxc: string, shortcode: string, label: string) => {
      const stickerUrl = mxcUrlToHttp(mx, mxc, useAuthentication);
      if (!stickerUrl) return;

      const info = await getImageInfo(
        await loadImageElement(stickerUrl),
        await getImageUrlBlob(stickerUrl)
      );

      const content: StickerEventContent & ReplyEventContent = {
        body: label,
        url: mxc,
        info,
      };
      if (replyDraft) {
        content['m.relates_to'] = getReplyContent(replyDraft);
        setReplyDraft(undefined);
      }
      mx.sendEvent(roomId, EventType.Sticker, content);
    };

    return (
      <div ref={ref}>
        {selectedFiles.length > 0 && (
          <UploadBoard
            header={
              <UploadBoardHeader
                open={uploadBoard}
                onToggle={() => setUploadBoard(!uploadBoard)}
                uploadFamilyObserverAtom={uploadFamilyObserverAtom}
                onSend={handleSendUpload}
                imperativeHandlerRef={uploadBoardHandlers}
                onCancel={handleCancelUpload}
              />
            }
          >
            {uploadBoard && (
              <Scroll size="300" hideTrack visibility="Hover">
                <UploadBoardContent>
                  {Array.from(selectedFiles)
                    .reverse()
                    .map((fileItem, index) => (
                      <UploadCardRenderer
                        // eslint-disable-next-line react/no-array-index-key
                        key={index}
                        isEncrypted={!!fileItem.encInfo}
                        fileItem={fileItem}
                        setMetadata={handleFileMetadata}
                        onRemove={handleRemoveUpload}
                        setDesc={setDesc}
                        roomId={roomId}
                      />
                    ))}
                </UploadBoardContent>
              </Scroll>
            )}
          </UploadBoard>
        )}
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
                <Icon size="600" src={Icons.File} />
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
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onPaste={handlePaste}
          top={
            <>
              {scheduledTime && (
                <div>
                  <Box
                    alignItems="Center"
                    gap="300"
                    style={{ padding: `${config.space.S200} ${config.space.S300} 0` }}
                  >
                    <IconButton
                      onClick={() => {
                        setScheduledTime(null);
                        setEditingScheduledDelayId(null);
                      }}
                      variant="SurfaceVariant"
                      size="300"
                      radii="300"
                      title="schedule message send"
                    >
                      <Icon src={Icons.Cross} size="50" />
                    </IconButton>
                    <Box direction="Row" gap="200" alignItems="Center">
                      <Icon size="100" src={Icons.Clock} />
                      <Text size="T300">
                        Scheduled for {timeDayMonthYear(scheduledTime.getTime())} at{' '}
                        {timeHourMinute(scheduledTime.getTime(), hour24Clock)}
                      </Text>
                    </Box>
                  </Box>
                </div>
              )}
              {replyDraft && (
                <div>
                  <Box
                    alignItems="Center"
                    gap="300"
                    style={{ padding: `${config.space.S200} ${config.space.S300} 0` }}
                  >
                    <IconButton
                      onClick={() => setReplyDraft(undefined)}
                      variant="SurfaceVariant"
                      size="300"
                      radii="300"
                      aria-label="Cancel reply"
                      title="Cancel reply"
                    >
                      <Icon src={Icons.Cross} size="50" />
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
                        {replyDraft.relation?.rel_type === RelationType.Thread && (
                          <ThreadIndicator />
                        )}
                        <ReplyLayout
                          userColor={replyUsernameColor}
                          username={
                            <Text size="T300" truncate style={{ fontFamily: replyUsernameFont }}>
                              <b>
                                {getMemberDisplayName(room, replyDraft.userId, nicknames) ??
                                  getMxIdLocalPart(replyDraft.userId) ??
                                  replyDraft.userId}
                              </b>
                            </Text>
                          }
                        >
                          <Text size="T300" truncate>
                            {replyBodyJSX}
                          </Text>
                        </ReplyLayout>
                      </Box>
                      <IconButton
                        variant="SurfaceVariant"
                        size="300"
                        radii="300"
                        title={
                          silentReply ? 'Unmute reply notifications' : 'Mute reply notifications'
                        }
                        aria-pressed={silentReply}
                        aria-label={
                          silentReply ? 'Unmute reply notifications' : 'Mute reply notifications'
                        }
                        onClick={() => setSilentReply(!silentReply)}
                      >
                        {!silentReply && <Icon src={Icons.BellPing} />}
                        {silentReply && <Icon src={Icons.BellMute} />}
                      </IconButton>
                    </Box>
                  </Box>
                </div>
              )}
            </>
          }
          before={
            <IconButton
              onClick={() => pickFile('*')}
              variant="SurfaceVariant"
              size="300"
              radii="300"
              title="Upload File"
              aria-label="Upload and attach a File"
            >
              <Icon src={Icons.PlusCircle} />
            </IconButton>
          }
          after={
            <>
              <IconButton
                variant="SurfaceVariant"
                size="300"
                radii="300"
                title={toolbar ? 'Hide Toolbar' : 'Show Toolbar'}
                aria-pressed={toolbar}
                aria-label={toolbar ? 'Hide Toolbar' : 'Show Toolbar'}
                onClick={() => setToolbar(!toolbar)}
              >
                <Icon src={toolbar ? Icons.AlphabetUnderline : Icons.Alphabet} />
              </IconButton>
              <UseStateProvider initial={undefined}>
                {(emojiBoardTab: EmojiBoardTab | undefined, setEmojiBoardTab) => (
                  <PopOut
                    offset={16}
                    alignOffset={-44}
                    position="Top"
                    align="End"
                    anchor={
                      emojiBoardTab === undefined
                        ? undefined
                        : (emojiBtnRef.current?.getBoundingClientRect() ?? undefined)
                    }
                    content={
                      <EmojiBoard
                        tab={emojiBoardTab}
                        onTabChange={setEmojiBoardTab}
                        imagePackRooms={imagePackRooms}
                        returnFocusOnDeactivate={false}
                        onEmojiSelect={handleEmoticonSelect}
                        onCustomEmojiSelect={handleEmoticonSelect}
                        onStickerSelect={handleStickerSelect}
                        requestClose={() => {
                          setEmojiBoardTab((t) => {
                            if (t) {
                              if (!mobileOrTablet()) ReactEditor.focus(editor);
                              return undefined;
                            }
                            return t;
                          });
                        }}
                      />
                    }
                  >
                    {!hideStickerBtn && (
                      <IconButton
                        aria-pressed={emojiBoardTab === EmojiBoardTab.Sticker}
                        onClick={() => setEmojiBoardTab(EmojiBoardTab.Sticker)}
                        variant="SurfaceVariant"
                        size="300"
                        radii="300"
                        title="open sticker picker"
                        aria-label="Open sticker picker"
                      >
                        <Icon
                          src={Icons.Sticker}
                          filled={emojiBoardTab === EmojiBoardTab.Sticker}
                        />
                      </IconButton>
                    )}
                    <IconButton
                      ref={emojiBtnRef}
                      aria-pressed={
                        hideStickerBtn ? !!emojiBoardTab : emojiBoardTab === EmojiBoardTab.Emoji
                      }
                      onClick={() => setEmojiBoardTab(EmojiBoardTab.Emoji)}
                      variant="SurfaceVariant"
                      size="300"
                      radii="300"
                      title="open emoji picker"
                      aria-label="Open emoji picker"
                    >
                      <Icon
                        src={Icons.Smile}
                        filled={
                          hideStickerBtn ? !!emojiBoardTab : emojiBoardTab === EmojiBoardTab.Emoji
                        }
                      />
                    </IconButton>
                  </PopOut>
                )}
              </UseStateProvider>
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
                          before={<Icon size="100" src={Icons.Send} />}
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
                          before={<Icon size="100" src={Icons.Clock} />}
                        >
                          <Text size="B300">Schedule Send</Text>
                        </MenuItem>
                      </Box>
                    </Menu>
                  </FocusTrap>
                }
              />
              <Box display="Flex" alignItems="Center">
                <IconButton
                  title="Send Message"
                  aria-label="Send your composed Message"
                  onClick={() => {
                    if (isLongPress.current) {
                      isLongPress.current = false;
                      return;
                    }
                    submit();
                  }}
                  onMouseDown={(e: MouseEvent) => e.preventDefault()}
                  onPointerDown={() => {
                    isLongPress.current = false;
                    if (mobileOrTablet() && delayedEventsSupported) {
                      longPressTimer.current = setTimeout(() => {
                        isLongPress.current = true;
                        setShowSchedulePicker(true);
                      }, 1000);
                    }
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
                  variant={scheduledTime ? 'Primary' : 'SurfaceVariant'}
                  size="300"
                  radii="0"
                  className={delayedEventsSupported ? css.SplitSendButton : undefined}
                >
                  <Icon src={scheduledTime ? Icons.Clock : Icons.Send} />
                </IconButton>
                {delayedEventsSupported && !mobileOrTablet() && (
                  <IconButton
                    onClick={(evt: MouseEvent<HTMLButtonElement>) => {
                      setScheduleMenuAnchor(evt.currentTarget.getBoundingClientRect());
                    }}
                    title="Schedule Message"
                    aria-label="Schedule message send"
                    variant={scheduledTime ? 'Primary' : 'SurfaceVariant'}
                    size="300"
                    radii="0"
                    className={css.SplitChevronButton}
                  >
                    <Icon size="50" src={Icons.ChevronBottom} />
                  </IconButton>
                )}
              </Box>
            </>
          }
          bottom={
            toolbar && (
              <div>
                <Line variant="SurfaceVariant" size="300" />
                <Toolbar />
              </div>
            )
          }
        />
        {showSchedulePicker && (
          <SchedulePickerDialog
            initialTime={scheduledTime?.getTime()}
            showEncryptionWarning={isEncrypted}
            onCancel={() => setShowSchedulePicker(false)}
            onSubmit={(date) => {
              setScheduledTime(date);
              setShowSchedulePicker(false);
            }}
          />
        )}
      </div>
    );
  }
);
