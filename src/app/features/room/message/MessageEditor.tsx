import type { KeyboardEventHandler, MouseEventHandler } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RectCords } from 'folds';
import { Box, Chip, Icon, IconButton, Icons, PopOut, Spinner, Text, as, config } from 'folds';
import { Editor, Transforms } from 'slate';
import { ReactEditor } from 'slate-react';
import type {
  IContent,
  IMentions,
  MatrixEvent,
  ReplacementEvent,
  Room,
  RoomMessageEventContent,
  RoomMessageTextEventContent,
} from '$types/matrix-sdk';
import { RelationType, MsgType } from '$types/matrix-sdk';
import { isKeyHotkey } from 'is-hotkey';
import type { AutocompleteQuery } from '$components/editor';
import {
  AutocompletePrefix,
  CustomEditor,
  EmoticonAutocomplete,
  MarkdownFormattingToolbarBottom,
  MarkdownFormattingToolbarToggle,
  RoomMentionAutocomplete,
  UserMentionAutocomplete,
  createEmoticonElement,
  customHtmlEqualsPlainText,
  getAutocompleteQuery,
  getPrevWorldRange,
  moveCursor,
  plainToEditorInput,
  toMatrixCustomHTML,
  toPlainText,
  trimCustomHtml,
  useEditor,
  getMentions,
  ANYWHERE_AUTOCOMPLETE_PREFIXES,
  getLinks,
  LINKINPUTREGEX,
} from '$components/editor';
import { htmlToMarkdown } from '$plugins/markdown';
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
import { useSettingsLinkBaseUrl } from '$features/settings/useSettingsLinkBaseUrl';
import { getReactCustomHtmlParser, LINKIFY_OPTS } from '$plugins/react-custom-html-parser';
import { useSpoilerClickHandler } from '$hooks/useSpoilerClickHandler';
import type { HTMLReactParserOptions } from 'html-react-parser';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import type { Opts as LinkifyOpts } from 'linkifyjs';
import type { GetContentCallback } from '$types/matrix/room';
import { sanitizeText } from '$utils/sanitize';
import type { BundleContent } from '$components/message';
import {
  readdAngleBracketsForHiddenPreviews,
  stripMarkdownEscapesForHiddenPreviews,
} from './hiddenLinkPreviews';

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
        customHtml = customHtml.replace(
          /^<strong\s+data-mx-profile-fallback[^>]*>.*?<\/strong>/,
          ''
        );
      }

      const bundleContent = content['com.beeper.linkpreviews'] as BundleContent[];
      const markHiddenLinks = (original: string, isHTML?: boolean) => {
        if (!bundleContent) return original;
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
            const isHidden =
              (bundleContent?.length === 0 ||
                bundleContent.filter((b) => s.includes(b.matched_url)).length === 0) &&
              strippedS.match(LINKINPUTREGEX) !== null;
            newBody += `${isHidden ? (isHTML && ((s.startsWith('<a') && `&lt;${s[0]}`) || `${s[0]}&lt;`)) || `${s[0]}<` : s[0]}${strippedS}${isHidden ? (isHTML && '&gt;') || '>' : ''}`;
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
        let plainText = toPlainText(editor.children).trim();
        let customHtml = trimCustomHtml(
          toMatrixCustomHTML(editor.children, { forEmote: msgtype === MsgType.Emote })
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

        const newContent: IContent = {
          msgtype,
          body: plainText,
        };

        const evtId = mEvent.getId();
        const evtTimeline = evtId ? room.getTimelineForEvent(evtId) : undefined;
        const editedEvent =
          evtTimeline && evtId
            ? getEditedEvent(evtId, mEvent, evtTimeline.getTimelineSet())
            : undefined;

        const rawPmp =
          editedEvent?.getContent()?.['m.new_content']?.['com.beeper.per_message_profile'] ??
          mEvent.getContent()?.['com.beeper.per_message_profile'];

        const pmpDisplayname =
          rawPmp !== null &&
          typeof rawPmp === 'object' &&
          'displayname' in rawPmp &&
          typeof rawPmp.displayname === 'string' &&
          rawPmp.displayname.length > 0
            ? (rawPmp.displayname as string)
            : undefined;

        if (pmpDisplayname) {
          const bodyPrefix = `${pmpDisplayname}: `;
          if (!plainText.startsWith(bodyPrefix)) {
            plainText = bodyPrefix + plainText;
          }

          const escapedName = sanitizeText(pmpDisplayname);
          const htmlPrefix = `<strong data-mx-profile-fallback>${escapedName}: </strong>`;
          if (!customHtml.startsWith(htmlPrefix)) {
            customHtml = htmlPrefix + customHtml;
          }

          newContent['com.beeper.per_message_profile'] = rawPmp;
        }

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

        const links = getLinks(editor.children);

        if (pmpDisplayname || !customHtmlEqualsPlainText(customHtml, plainText)) {
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
        content['com.beeper.linkpreviews'] = [];
        links?.forEach((link) => content['com.beeper.linkpreviews'].push({ matched_url: link }));
        content['m.new_content']['com.beeper.linkpreviews'] = content['com.beeper.linkpreviews'];

        return mx.sendMessage(roomId, content as RoomMessageEventContent);
      }, [mx, editor, roomId, mEvent, getPrevBodyAndFormattedBody, room])
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
          const prevWordRange = getPrevWorldRange(editor);
          if (
            prevWordRange &&
            getAutocompleteQuery(editor, prevWordRange, ANYWHERE_AUTOCOMPLETE_PREFIXES)
          )
            return;

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

      const initialValue = plainToEditorInput(
        customHtml
          ? stripMarkdownEscapesForHiddenPreviews(htmlToMarkdown(customHtml))
          : typeof body === 'string'
            ? body
            : ''
      );

      Transforms.select(editor, {
        anchor: Editor.start(editor, []),
        focus: Editor.end(editor, []),
      });

      editor.insertFragment(initialValue);
      if (!mobileOrTablet()) ReactEditor.focus(editor);
    }, [editor, getPrevBodyAndFormattedBody]);

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
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
              bottom={
                <>
                  <MarkdownFormattingToolbarBottom />
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
                      <MarkdownFormattingToolbarToggle variant="SurfaceVariant" />
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
                </>
              }
            />
          </Box>
        </Box>
      </div>
    );
  }
);
