import type { KeyboardEventHandler, MouseEventHandler, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAtomValue } from 'jotai';
import type { RectCords } from 'folds';
import { Box, Chip, IconButton, OverlayBackdrop, Spinner, Text, as, config } from 'folds';
import { Overlay, PopOut } from '$components/overlay-stack';
import { composerIcon, Smiley } from '$components/icons/phosphor';
import type {
  IContent,
  IMentions,
  MatrixEvent,
  Room,
  RoomMessageEventContent,
  RoomMessageTextEventContent,
} from '$types/matrix-sdk';
import { MsgType } from '$types/matrix-sdk';
import { isKeyHotkey } from 'is-hotkey';
import type { EditorDocument } from '$components/editor/model';
import {
  AutocompletePrefix,
  useAutocompleteQuery,
  CustomEditor,
  EmoticonAutocomplete,
  MarkdownFormattingToolbarBottom,
  MarkdownFormattingToolbarToggle,
  RoomMentionAutocomplete,
  UserMentionAutocomplete,
  createEmoticonElement,
  customHtmlEqualsPlainText,
  plainToEditorInput,
  toMatrixCustomHTML,
  toPlainText,
  trimCustomHtml,
  useEditor,
  getMentions,
  ANYWHERE_AUTOCOMPLETE_PREFIXES,
  getDocumentLinks,
  LINKINPUTREGEX,
} from '$components/editor';
import { htmlToMarkdown } from '$plugins/markdown';
import { useSetting } from '$state/hooks/settings';
import { CaptionPosition, settingsAtom } from '$state/settings';
import { UseStateProvider } from '$components/UseStateProvider';
import { EmojiBoard } from '$components/emoji-board';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useDismissOnBack } from '$utils/androidBack';
import { nicknamesAtom } from '$state/nicknames';
import { getEditedEvent, getMentionContent } from '$utils/room/relations';
import { trimReplyFromFormattedBody } from '$utils/room/display';
import { buildReplacementContent } from '../buildReplacementContent';
import { isMobileOrTablet } from '$utils/platform';
import { useComposingCheck } from '$hooks/useComposingCheck';
import { floatingEditor } from '$styles/overrides/Composer.css';
import { RenderMessageContent } from '$components/RenderMessageContent';
import { useSettingsLinkBaseUrl } from '$features/settings/useSettingsLinkBaseUrl';
import { getReactCustomHtmlParser, LINKIFY_OPTS } from '$plugins/react-custom-html-parser';
import { testMatrixTo } from '$plugins/matrix-to';
import { useSpoilerClickHandler } from '$hooks/useSpoilerClickHandler';
import type { HTMLReactParserOptions } from 'html-react-parser';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import type { Opts as LinkifyOpts } from 'linkifyjs';
import type { GetContentCallback } from '$types/matrix/room';
import type { BundleContent } from '$components/message';
import {
  readdAngleBracketsForHiddenPreviews,
  stripMarkdownEscapesForHiddenPreviews,
} from './hiddenLinkPreviews';
import { stripPerMessageProfileFormattedBody } from '$hooks/usePerMessageProfile';

// Wraps the mobile emoji-board overlay so the Android back action closes it
// instead of navigating away. Hooks can't run inside the UseStateProvider
// render-prop below, so this component holds the back handler.
function MobileEmojiOverlay({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useDismissOnBack(onClose, open);
  return (
    <Overlay open={open} backdrop={<OverlayBackdrop />}>
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        {children}
      </div>
    </Overlay>
  );
}

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
    const nicknames = useAtomValue(nicknamesAtom);
    const editor = useEditor();
    const [enterForNewline] = useSetting(settingsAtom, 'enterForNewline');
    const [pmpNoFallback] = useSetting(settingsAtom, 'pmpNoFallback');
    const isComposing = useComposingCheck();

    const [autocompleteQuery, setAutocompleteQuery, handleCloseAutocomplete] =
      useAutocompleteQuery(editor);

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
      let { body, formatted_body: customHtml }: Record<string, unknown> = content;
      const mMentions: IMentions | undefined = content['m.mentions'];

      const rawPmp = content['com.beeper.per_message_profile'];
      const pmpDisplayname =
        rawPmp !== null &&
        typeof rawPmp === 'object' &&
        'displayname' in rawPmp &&
        typeof rawPmp.displayname === 'string' &&
        rawPmp.displayname.length > 0
          ? (rawPmp.displayname as string)
          : undefined;

      if (pmpDisplayname && typeof body === 'string') {
        const bodyPrefix = `${pmpDisplayname}: `;
        if (body.startsWith(bodyPrefix)) {
          body = body.slice(bodyPrefix.length);
        }
      }

      if (pmpDisplayname && typeof customHtml === 'string') {
        customHtml = stripPerMessageProfileFormattedBody(customHtml);
      }

      const bundleContent =
        (content['com.beeper.linkpreviews'] as BundleContent[] | undefined) ?? [];
      const markHiddenLinks = (original: string, isHTML?: boolean) => {
        if (!isHTML) {
          return readdAngleBracketsForHiddenPreviews(original, bundleContent);
        }
        /* Split according to the following fule:
              - if its not HTML just break it by spaces, newLines, and parans
              - if it is HTML 
                - break it before before any potential opening tag
                - break it whenever a <a> tag starts
                - break it after a closing </a> tag
                - then for every non <a> portion find regular links as though it is plaintext
                  * this is not recursive but needs flattening              
         */
        const splitBody = original.split(/(?=^.+<)|(?=<a.+)|(?<=\/a>)|(?=<code.+)|(?<=\/code>)/gi);
        let newBody = '';
        splitBody
          .map((item) => (item.startsWith('<a') ? [item] : item.split(/(?=[ \n()])/g)))
          .reduce((acc, current) => acc.concat(current), [])
          .map((s) => {
            // the length is from the fact that a link is necessarily longer than 6
            if (s.length < 6 || s.startsWith('<code') || s.endsWith('code>')) {
              newBody += s;
              return;
            }
            // since the way that the match works the key is at the start of the string,
            // it needs to be separated such that it can be reintroduced before the < in case of regular text
            // or after it in case that it is matching a <a> tag
            const strippedS = s.substring(1);
            const matrixToAnchorHref =
              isHTML && s.toLowerCase().startsWith('<a')
                ? s.match(/href\s*=\s*["']([^"']+)["']/i)?.[1]
                : undefined;
            const urlFromChunk = strippedS.match(/https?:\/\/[^\s)]+/)?.[0];
            const isMatrixToPermalink = testMatrixTo(matrixToAnchorHref ?? urlFromChunk ?? '');
            const isHidden =
              !isMatrixToPermalink &&
              (bundleContent?.length === 0 ||
                bundleContent.filter((b) => s.includes(b.matched_url)).length === 0) &&
              strippedS.match(LINKINPUTREGEX) !== null;

            // Wrap whole <a>…</a> as &lt;…&gt; once; duplicating the leading "<" breaks htmlToMarkdown's [<][a][>] detection.
            if (isHidden && isHTML && s.toLowerCase().startsWith('<a')) {
              newBody += `&lt;${s}&gt;`;
              return;
            }

            newBody += `${isHidden ? (isHTML && `${s[0]}&lt;`) || `${s[0]}<` : s[0]}${strippedS}${isHidden ? (isHTML && '&gt;') || '>' : ''}`;
          });
        return newBody;
      };

      return [
        typeof body === 'string' ? markHiddenLinks(body) : undefined,
        typeof customHtml === 'string' ? markHiddenLinks(customHtml, true) : undefined,
        mMentions,
      ];
    }, [room, mEvent]);

    const [saveState, save] = useAsyncCallback(
      useCallback(async () => {
        const oldContent = mEvent.getContent();
        const msgtype = mEvent.getContent().msgtype as RoomMessageTextEventContent['msgtype'];
        let plainText = toPlainText(editor.children as EditorDocument).trim();
        let customHtml = trimCustomHtml(
          toMatrixCustomHTML(editor.children as EditorDocument, {
            forEmote: msgtype === MsgType.Emote,
            room,
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

        const evtId = mEvent.getId();
        const evtTimeline = evtId ? room.getTimelineForEvent(evtId) : undefined;
        const editedEvent =
          evtTimeline && evtId
            ? getEditedEvent(evtId, mEvent, evtTimeline.getTimelineSet())
            : undefined;

        const rawPmp =
          editedEvent?.getContent()?.['m.new_content']?.['com.beeper.per_message_profile'] ??
          mEvent.getContent()?.['com.beeper.per_message_profile'];

        const mentionData = getMentions(mx, roomId, {
          children: editor.children as EditorDocument,
        });

        prevMentions?.user_ids?.forEach((prevMentionId) => {
          mentionData.users.add(prevMentionId);
        });

        const mMentions = getMentionContent(Array.from(mentionData.users), mentionData.room);

        const linkPreviews =
          getDocumentLinks(editor.children as EditorDocument)?.map((matchedUrl) => ({
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

        return mx.sendMessage(roomId, content as RoomMessageEventContent);
      }, [mx, editor, roomId, mEvent, getPrevBodyAndFormattedBody, room, pmpNoFallback])
    );

    const handleSave = useCallback(() => {
      if (saveState.status !== AsyncStatus.Loading) {
        save();
      }
    }, [saveState, save]);

    const suppressBlurRefocusRef = useRef(false);
    const suppressEditorRefocus = useCallback(() => {
      suppressBlurRefocusRef.current = true;
      requestAnimationFrame(() => {
        suppressBlurRefocusRef.current = false;
      });
    }, []);

    const handleKeyDown: KeyboardEventHandler = useCallback(
      (evt) => {
        if (
          (isKeyHotkey('mod+enter', evt) || (!enterForNewline && isKeyHotkey('enter', evt))) &&
          !isComposing(evt)
        ) {
          if (editor.getAutocompleteQuery(ANYWHERE_AUTOCOMPLETE_PREFIXES)) return;

          evt.preventDefault();
          handleSave();
        }
        if (isKeyHotkey('escape', evt)) {
          evt.preventDefault();
          onCancel();
        }
      },
      [enterForNewline, isComposing, editor, handleSave, onCancel]
    );

    const detectAutocomplete = useCallback(() => {
      setAutocompleteQuery(editor.getAutocompleteQuery(ANYWHERE_AUTOCOMPLETE_PREFIXES));
    }, [editor, setAutocompleteQuery]);

    const handleKeyUp: KeyboardEventHandler = useCallback(
      (evt) => {
        if (isKeyHotkey('escape', evt)) {
          evt.preventDefault();
          return;
        }

        detectAutocomplete();
      },
      [detectAutocomplete]
    );

    const handleEmoticonSelect = (key: string, shortcode: string) => {
      editor.insertInline(createEmoticonElement(key, shortcode));
      editor.insertText(' ');
    };

    useEffect(() => {
      const [body, customHtml] = getPrevBodyAndFormattedBody();

      const mentionOptions = {
        room,
        nicknames,
        mxUserId: mx.getUserId() ?? undefined,
      };
      const initialValue = plainToEditorInput(
        customHtml
          ? stripMarkdownEscapesForHiddenPreviews(htmlToMarkdown(customHtml))
          : typeof body === 'string'
            ? stripMarkdownEscapesForHiddenPreviews(body)
            : '',
        mentionOptions
      );

      editor.setDocument(initialValue);
      if (!isMobileOrTablet()) editor.focus();
    }, [editor, getPrevBodyAndFormattedBody, room, nicknames, mx]);

    useEffect(() => {
      if (saveState.status === AsyncStatus.Success) {
        onCancel();
      }
    }, [saveState, onCancel]);

    const useAuthentication = useMediaAuthentication();
    const settingsLinkBaseUrl = useSettingsLinkBaseUrl();
    const linkifyOpts = useMemo<LinkifyOpts>(() => ({ ...LINKIFY_OPTS }), []);
    const spoilerClickHandler = useSpoilerClickHandler();
    const [incomingInlineImagesDefaultHeight] = useSetting(
      settingsAtom,
      'incomingInlineImagesDefaultHeight'
    );
    const [incomingInlineImagesMaxHeight] = useSetting(
      settingsAtom,
      'incomingInlineImagesMaxHeight'
    );
    const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
      () =>
        getReactCustomHtmlParser(mx, mEvent.getRoomId(), {
          settingsLinkBaseUrl,
          linkifyOpts,
          useAuthentication,
          handleSpoilerClick: spoilerClickHandler,
          incomingInlineImagesDefaultHeight,
          incomingInlineImagesMaxHeight,
        }),
      [
        linkifyOpts,
        mEvent,
        mx,
        settingsLinkBaseUrl,
        spoilerClickHandler,
        useAuthentication,
        incomingInlineImagesDefaultHeight,
        incomingInlineImagesMaxHeight,
      ]
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
            imagePackRooms={imagePackRooms || []}
            controller={editor}
            query={autocompleteQuery!}
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
              room={room}
            />
          )}
          <Box
            style={
              captionPosition !== CaptionPosition.Inline
                ? {
                    marginTop:
                      msgType === MsgType.Image ||
                      msgType === MsgType.Video ||
                      msgType === MsgType.Audio ||
                      msgType === MsgType.File
                        ? config.space.S400
                        : undefined,
                    width: '100%',
                  }
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
              suppressBlurRefocusRef={suppressBlurRefocusRef}
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
              bottom={
                <>
                  <MarkdownFormattingToolbarBottom controller={editor} />
                  <Box
                    style={{ padding: config.space.S200, paddingTop: 0 }}
                    alignItems="End"
                    justifyContent="SpaceBetween"
                    gap="100"
                  >
                    <Box gap="Inherit">
                      <Chip
                        onClick={handleSave}
                        onPointerDown={suppressEditorRefocus}
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
                      <Chip
                        onClick={onCancel}
                        onPointerDown={suppressEditorRefocus}
                        variant="SurfaceVariant"
                        radii="Pill"
                      >
                        <Text size="B300">Cancel</Text>
                      </Chip>
                    </Box>
                    <Box gap="Inherit">
                      <MarkdownFormattingToolbarToggle variant="SurfaceVariant" />
                      <UseStateProvider initial={undefined}>
                        {(anchor: RectCords | undefined, setAnchor) => {
                          const emojiBoard = (
                            <EmojiBoard
                              imagePackRooms={imagePackRooms ?? []}
                              returnFocusOnDeactivate={false}
                              isFullWidth={isMobileOrTablet()}
                              onEmojiSelect={handleEmoticonSelect}
                              onCustomEmojiSelect={handleEmoticonSelect}
                              requestClose={() => {
                                setAnchor((v) => {
                                  if (v) {
                                    if (!isMobileOrTablet()) editor.focus();
                                    return undefined;
                                  }
                                  return v;
                                });
                              }}
                            />
                          );
                          const trigger = (
                            <IconButton
                              aria-pressed={anchor !== undefined}
                              onClick={
                                ((evt) =>
                                  setAnchor(
                                    evt.currentTarget.getBoundingClientRect()
                                  )) as MouseEventHandler<HTMLButtonElement>
                              }
                              onPointerDown={suppressEditorRefocus}
                              variant="SurfaceVariant"
                              size="300"
                              radii="300"
                            >
                              {composerIcon(Smiley, {
                                weight: anchor !== undefined ? 'fill' : 'regular',
                              })}
                            </IconButton>
                          );
                          if (isMobileOrTablet()) {
                            return (
                              <>
                                {trigger}
                                <MobileEmojiOverlay
                                  open={anchor !== undefined}
                                  onClose={() => setAnchor(undefined)}
                                >
                                  {emojiBoard}
                                </MobileEmojiOverlay>
                              </>
                            );
                          }
                          return (
                            <PopOut
                              anchor={anchor}
                              alignOffset={-8}
                              position="Top"
                              align="End"
                              content={emojiBoard}
                            >
                              {trigger}
                            </PopOut>
                          );
                        }}
                      </UseStateProvider>
                    </Box>
                  </Box>
                </>
              }
            />
          </Box>
        </Box>
      </div>
    );
  }
);
