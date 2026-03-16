import {
  KeyboardEventHandler,
  MouseEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Box,
  Chip,
  Icon,
  IconButton,
  Icons,
  Line,
  PopOut,
  RectCords,
  Spinner,
  Text,
  as,
  config,
} from 'folds';
import { Editor, Transforms } from 'slate';
import { ReactEditor } from 'slate-react';
import {
  IContent,
  IMentions,
  MatrixEvent,
  ReplacementEvent,
  RelationType,
  Room,
  RoomMessageTextEventContent,
  MsgType,
} from '$types/matrix-sdk';
import { isKeyHotkey } from 'is-hotkey';
import {
  AutocompletePrefix,
  AutocompleteQuery,
  CustomEditor,
  EmoticonAutocomplete,
  RoomMentionAutocomplete,
  Toolbar,
  UserMentionAutocomplete,
  createEmoticonElement,
  customHtmlEqualsPlainText,
  getAutocompleteQuery,
  getPrevWorldRange,
  htmlToEditorInput,
  moveCursor,
  plainToEditorInput,
  toMatrixCustomHTML,
  toPlainText,
  trimCustomHtml,
  useEditor,
  getMentions,
  ANYWHERE_AUTOCOMPLETE_PREFIXES,
} from '$components/editor';
import { useSetting } from '$state/hooks/settings';
import { CaptionPosition, settingsAtom } from '$state/settings';
import { UseStateProvider } from '$components/UseStateProvider';
import { EmojiBoard } from '$components/emoji-board';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { getEditedEvent, getMentionContent, trimReplyFromFormattedBody } from '$utils/room';
import { mobileOrTablet } from '$utils/user-agent';
import { useComposingCheck } from '$hooks/useComposingCheck';
import { floatingEditor } from '$styles/overrides/Composer.css';
import { RenderMessageContent } from '$components/RenderMessageContent';
import { getReactCustomHtmlParser, LINKIFY_OPTS } from '$plugins/react-custom-html-parser';
import { useSpoilerClickHandler } from '$hooks/useSpoilerClickHandler';
import { HTMLReactParserOptions } from 'html-react-parser';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { Opts as LinkifyOpts } from 'linkifyjs';
import { GetContentCallback } from '$types/matrix/room';

type MessageEditorProps = {
  roomId: string;
  room: Room;
  mEvent: MatrixEvent;
  imagePackRooms?: Room[];
  onCancel: () => void;
};
export const MessageEditor = as<'div', MessageEditorProps>(
  ({ room, roomId, mEvent, imagePackRooms, onCancel, ...props }, ref) => {
    const mx = useMatrixClient();
    const editor = useEditor();
    const [enterForNewline] = useSetting(settingsAtom, 'enterForNewline');
    const [globalToolbar] = useSetting(settingsAtom, 'editorToolbar');
    const [isMarkdown] = useSetting(settingsAtom, 'isMarkdown');
    const [toolbar, setToolbar] = useState(globalToolbar);
    const isComposing = useComposingCheck();

    const [autocompleteQuery, setAutocompleteQuery] =
      useState<AutocompleteQuery<AutocompletePrefix>>();

    const getPrevBodyAndFormattedBody = useCallback((): [
      string | undefined,
      string | undefined,
      IMentions | undefined,
    ] => {
      const evtId = mEvent.getId();
      if (!evtId) return [undefined, undefined, undefined];
      const evtTimeline = room.getTimelineForEvent(evtId);
      const editedEvent =
        evtTimeline && getEditedEvent(evtId, mEvent, evtTimeline.getTimelineSet());

      const content: IContent = editedEvent?.getContent()['m.new_content'] ?? mEvent.getContent();
      const { body, formatted_body: customHtml }: Record<string, unknown> = content;

      const mMentions: IMentions | undefined = content['m.mentions'];

      return [
        typeof body === 'string' ? body : undefined,
        typeof customHtml === 'string' ? customHtml : undefined,
        mMentions,
      ];
    }, [room, mEvent]);

    const [saveState, save] = useAsyncCallback(
      useCallback(async () => {
        const oldContent = mEvent.getContent();
        const plainText = toPlainText(editor.children, isMarkdown).trim();
        const customHtml = trimCustomHtml(
          toMatrixCustomHTML(editor.children, {
            allowTextFormatting: true,
            allowBlockMarkdown: isMarkdown,
            allowInlineMarkdown: isMarkdown,
          })
        );

        const [prevBody, prevCustomHtml, prevMentions] = getPrevBodyAndFormattedBody();

        if (plainText === '') return undefined;
        const eventId = mEvent.getId();
        if (!eventId) return undefined;

        if (prevBody) {
          if (prevCustomHtml && trimReplyFromFormattedBody(prevCustomHtml) === customHtml) {
            return undefined;
          }
          if (
            !prevCustomHtml &&
            prevBody === plainText &&
            customHtmlEqualsPlainText(customHtml, plainText)
          ) {
            return undefined;
          }
        }

        const msgtype = mEvent.getContent().msgtype as RoomMessageTextEventContent['msgtype'];

        const newContent: IContent = {
          msgtype,
          body: plainText,
        };

        const contentBody: IContent & Omit<ReplacementEvent<IContent>, 'm.relates_to'> = {
          msgtype,
          body: `* ${plainText}`,
          'm.new_content': newContent,
        };

        const mentionData = getMentions(mx, roomId, editor);

        prevMentions?.user_ids?.forEach((prevMentionId) => {
          mentionData.users.add(prevMentionId);
        });

        const mMentions = getMentionContent(Array.from(mentionData.users), mentionData.room);
        newContent['m.mentions'] = mMentions;
        contentBody['m.mentions'] = mMentions;

        if (!customHtmlEqualsPlainText(customHtml, plainText)) {
          newContent.format = 'org.matrix.custom.html';
          newContent.formatted_body = customHtml;
          contentBody.format = 'org.matrix.custom.html';
          contentBody.formatted_body = `* ${customHtml}`;
        }

        const content: IContent = {
          ...oldContent,
          'm.relates_to': {
            event_id: eventId,
            rel_type: RelationType.Replace,
          },
        };
        content.body = contentBody.body;
        content.format = contentBody.format;
        content.formatted_body = contentBody.formatted_body;
        content['m.new_content'] = newContent;
        if (oldContent.info !== undefined && oldContent.filename?.length > 0) {
          content.filename = oldContent.filename;
          content['m.new_content'].filename = oldContent.filename;
          content.info = oldContent.info;
          content['m.new_content'].info = oldContent.info;

          if (oldContent.file !== undefined) content['m.new_content'].file = oldContent.file;
          if (oldContent.url !== undefined) content['m.new_content'].url = oldContent.url;

          if (oldContent['page.codeberg.everypizza.msc4193.spoiler'] !== undefined) {
            content['page.codeberg.everypizza.msc4193.spoiler'] =
              oldContent['page.codeberg.everypizza.msc4193.spoiler'];
            content['m.new_content']['page.codeberg.everypizza.msc4193.spoiler'] =
              oldContent['page.codeberg.everypizza.msc4193.spoiler'];
          }
        }

        return mx.sendMessage(roomId, content as any);
      }, [mx, editor, roomId, mEvent, isMarkdown, getPrevBodyAndFormattedBody])
    );

    const handleSave = useCallback(() => {
      if (saveState.status !== AsyncStatus.Loading) {
        save();
      }
    }, [saveState, save]);

    const handleKeyDown: KeyboardEventHandler = useCallback(
      (evt) => {
        if (
          (isKeyHotkey('mod+enter', evt) || (!enterForNewline && isKeyHotkey('enter', evt))) &&
          !isComposing(evt)
        ) {
          evt.preventDefault();
          handleSave();
        }
        if (isKeyHotkey('escape', evt)) {
          evt.preventDefault();
          onCancel();
        }
      },
      [onCancel, handleSave, enterForNewline, isComposing]
    );

    const handleKeyUp: KeyboardEventHandler = useCallback(
      (evt) => {
        if (isKeyHotkey('escape', evt)) {
          evt.preventDefault();
          return;
        }

        const prevWordRange = getPrevWorldRange(editor);
        const query = prevWordRange
          ? getAutocompleteQuery(editor, prevWordRange, ANYWHERE_AUTOCOMPLETE_PREFIXES)
          : undefined;
        setAutocompleteQuery(query);
      },
      [editor]
    );

    const handleCloseAutocomplete = useCallback(() => {
      ReactEditor.focus(editor);
      setAutocompleteQuery(undefined);
    }, [editor]);

    const handleEmoticonSelect = (key: string, shortcode: string) => {
      editor.insertNode(createEmoticonElement(key, shortcode));
      moveCursor(editor);
    };

    useEffect(() => {
      const [body, customHtml] = getPrevBodyAndFormattedBody();

      const initialValue =
        typeof customHtml === 'string'
          ? htmlToEditorInput(customHtml, isMarkdown)
          : plainToEditorInput(typeof body === 'string' ? body : '', isMarkdown);

      Transforms.select(editor, {
        anchor: Editor.start(editor, []),
        focus: Editor.end(editor, []),
      });

      editor.insertFragment(initialValue);
      if (!mobileOrTablet()) ReactEditor.focus(editor);
    }, [editor, getPrevBodyAndFormattedBody, isMarkdown]);

    useEffect(() => {
      if (saveState.status === AsyncStatus.Success) {
        onCancel();
      }
    }, [saveState, onCancel]);

    const useAuthentication = useMediaAuthentication();
    const linkifyOpts = useMemo<LinkifyOpts>(() => ({ ...LINKIFY_OPTS }), []);
    const spoilerClickHandler = useSpoilerClickHandler();
    const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
      () =>
        getReactCustomHtmlParser(mx, mEvent.getRoomId(), {
          linkifyOpts,
          useAuthentication,
          handleSpoilerClick: spoilerClickHandler,
        }),
      [linkifyOpts, mEvent, mx, spoilerClickHandler, useAuthentication]
    );
    const getContent = (() => mEvent.getContent()) as GetContentCallback;
    const msgType = mEvent.getContent().msgtype;
    const [captionPosition] = useSetting(settingsAtom, 'captionPosition');
    const captionPositionMap = {
      [CaptionPosition.Above]: 'column-reverse',
      [CaptionPosition.Below]: 'column',
      [CaptionPosition.Inline]: 'row',
      [CaptionPosition.Hidden]: 'row',
    } satisfies Record<CaptionPosition, React.CSSProperties['flexDirection']>;
    return (
      <div {...props} ref={ref} className={`${props.className || ''} ${floatingEditor}`.trim()}>
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
            imagePackRooms={imagePackRooms || []}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        <Box
          style={{
            display: 'flex',
            flexDirection: captionPositionMap[captionPosition],
          }}
        >
          {(msgType === MsgType.Image ||
            msgType === MsgType.Video ||
            msgType === MsgType.Audio ||
            msgType === MsgType.File) && (
            <RenderMessageContent
              displayName={mEvent.sender?.name ?? ''}
              msgType={mEvent.getContent().msgtype ?? ''}
              ts={mEvent.getTs()}
              getContent={getContent}
              htmlReactParserOptions={htmlReactParserOptions}
              hideCaption
              linkifyOpts={linkifyOpts}
            />
          )}
          <Box
            style={
              captionPosition !== CaptionPosition.Inline
                ? { marginTop: config.space.S400, width: '100%' }
                : {
                    padding: config.space.S200,
                    wordBreak: 'break-word',
                    maxWidth: '100%',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    flexShrink: 1,
                  }
            }
          >
            <CustomEditor
              editor={editor}
              placeholder="Edit message..."
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
              bottom={
                <>
                  <Box
                    style={{ padding: config.space.S200, paddingTop: 0 }}
                    alignItems="End"
                    justifyContent="SpaceBetween"
                    gap="100"
                  >
                    <Box gap="Inherit">
                      <Chip
                        onClick={handleSave}
                        variant="Primary"
                        radii="Pill"
                        disabled={saveState.status === AsyncStatus.Loading}
                        outlined
                        before={
                          saveState.status === AsyncStatus.Loading ? (
                            <Spinner variant="Primary" fill="Soft" size="100" />
                          ) : undefined
                        }
                      >
                        <Text size="B300">Save</Text>
                      </Chip>
                      <Chip onClick={onCancel} variant="SurfaceVariant" radii="Pill">
                        <Text size="B300">Cancel</Text>
                      </Chip>
                    </Box>
                    <Box gap="Inherit">
                      <IconButton
                        variant="SurfaceVariant"
                        size="300"
                        radii="300"
                        onClick={() => setToolbar(!toolbar)}
                      >
                        <Icon size="400" src={toolbar ? Icons.AlphabetUnderline : Icons.Alphabet} />
                      </IconButton>
                      <UseStateProvider initial={undefined}>
                        {(anchor: RectCords | undefined, setAnchor) => (
                          <PopOut
                            anchor={anchor}
                            alignOffset={-8}
                            position="Top"
                            align="End"
                            content={
                              <EmojiBoard
                                imagePackRooms={imagePackRooms ?? []}
                                returnFocusOnDeactivate={false}
                                onEmojiSelect={handleEmoticonSelect}
                                onCustomEmojiSelect={handleEmoticonSelect}
                                requestClose={() => {
                                  setAnchor((v) => {
                                    if (v) {
                                      if (!mobileOrTablet()) ReactEditor.focus(editor);
                                      return undefined;
                                    }
                                    return v;
                                  });
                                }}
                              />
                            }
                          >
                            <IconButton
                              aria-pressed={anchor !== undefined}
                              onClick={
                                ((evt) =>
                                  setAnchor(
                                    evt.currentTarget.getBoundingClientRect()
                                  )) as MouseEventHandler<HTMLButtonElement>
                              }
                              variant="SurfaceVariant"
                              size="300"
                              radii="300"
                            >
                              <Icon size="400" src={Icons.Smile} filled={anchor !== undefined} />
                            </IconButton>
                          </PopOut>
                        )}
                      </UseStateProvider>
                    </Box>
                  </Box>
                  {toolbar && (
                    <div>
                      <Line variant="SurfaceVariant" size="300" />
                      <Toolbar />
                    </div>
                  )}
                </>
              }
            />
          </Box>
        </Box>
      </div>
    );
  }
);
