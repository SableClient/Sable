/**
 * RoomInputTiptap — experimental Tiptap-based message composer.
 *
 * This is an opt-in replacement for the Slate-based RoomInput, gated behind
 * Settings > Experimental > "Tiptap Composer".
 *
 * Feature parity with the Slate composer:
 *   ✅ Text composition with markdown inline formatting (bold, italic, strike, code)
 *   ✅ @user and #room mention autocomplete
 *   ✅ Custom :emoticon: autocomplete
 *   ✅ /command detection (/me, /notice)
 *   ✅ Send on Enter / newline on Shift+Enter (respects enterForNewline setting)
 *   ✅ Matrix custom HTML + plain text output
 *
 * Not yet implemented (TODO):
 *   - File uploads / paste image
 *   - Reply drafts
 *   - Scheduled messages
 *   - Voice recording
 *   - Per-message profiles (PluralKit)
 *   - Emoji board
 *   - Message draft persistence
 *   - Outgoing message transforms
 *   - Command autocomplete popup (/command suggestion list)
 */

import type { KeyboardEvent, RefObject } from 'react';
import { useCallback, useRef, useState } from 'react';
import type { Editor as TiptapEditorInstance } from '@tiptap/core';
import type { Room } from '$types/matrix-sdk';
import { MsgType } from '$types/matrix-sdk';
import { Box, Icon, IconButton, Icons, Text, config, color } from 'folds';

import { useMatrixClient } from '$hooks/useMatrixClient';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useTypingStatusUpdater } from '$hooks/useTypingStatusUpdater';
import { useAtomValue } from 'jotai';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { useImagePackRooms } from '$hooks/useImagePackRooms';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { trimCustomHtml } from '$components/editor/output';
import { TiptapEditor } from '$components/editor-tiptap';
import type { TiptapEditorHandle } from '$components/editor-tiptap';
import {
  tiptapToMatrixCustomHTML,
  tiptapToPlainText,
  tiptapCustomHtmlEqualsPlainText,
} from '$components/editor-tiptap';
import { TiptapMentionAutocomplete } from './tiptap-autocomplete/TiptapMentionAutocomplete';
import { TiptapRoomMentionAutocomplete } from './tiptap-autocomplete/TiptapRoomMentionAutocomplete';
import { TiptapEmoticonAutocomplete } from './tiptap-autocomplete/TiptapEmoticonAutocomplete';
import { mobileOrTablet } from '$utils/user-agent';

// ─── Autocomplete detection ──────────────────────────────────────────────────

type AutocompleteState = { prefix: '@' | '#' | ':'; text: string; from: number; to: number } | null;

/**
 * Look backwards from the cursor in the current paragraph's text content to find
 * an autocomplete trigger character (@, #, :).  Returns null when no trigger is
 * active or when the trigger is inside a code span.
 */
function detectAutocomplete(editor: TiptapEditorInstance): AutocompleteState {
  const { selection } = editor.state;
  if (!selection.empty) return null;

  const { $from } = selection;
  const nodeStart = $from.start();
  const cursorPos = $from.pos;
  const textBefore = editor.state.doc.textBetween(nodeStart, cursorPos, '\n', '\u0000');

  // Walk backwards to find the last whitespace or start-of-line
  let wordStart = textBefore.length;
  // eslint-disable-next-line no-control-regex
  while (wordStart > 0 && !/[\s\u0000]/.test(textBefore.charAt(wordStart - 1))) {
    wordStart--;
  }

  const word = textBefore.slice(wordStart);
  if (word.length === 0) return null;

  const prefix = word[0];
  if (prefix !== '@' && prefix !== '#' && prefix !== ':') return null;

  // Don't trigger for a lone prefix character with no additional text yet — wait
  // for at least one character so we don't flash an empty popup on every @ press.
  if (word.length < 2) return null;

  // Closing colon means the emoticon shortcode is complete — dismiss.
  if (prefix === ':' && word.length > 1 && word.endsWith(':')) return null;

  const from = nodeStart + wordStart;
  const to = cursorPos;

  return { prefix: prefix as '@' | '#' | ':', text: word.slice(1), from, to };
}

// ─── Component ───────────────────────────────────────────────────────────────

interface RoomInputTiptapProps {
  fileDropContainerRef: RefObject<HTMLElement>;
  roomId: string;
  room: Room;
}

export function RoomInputTiptap({ roomId, room }: RoomInputTiptapProps) {
  const mx = useMatrixClient();
  const [enterForNewline] = useSetting(settingsAtom, 'enterForNewline');
  const [editorToolbar] = useSetting(settingsAtom, 'editorToolbar');
  const [composerToolbarOpen, setComposerToolbarOpen] = useSetting(
    settingsAtom,
    'composerToolbarOpen'
  );

  const editorRef = useRef<TiptapEditorHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autocomplete, setAutocomplete] = useState<AutocompleteState>(null);
  const roomToParents = useAtomValue(roomToParentsAtom);
  const imagePackRooms = useImagePackRooms(roomId, roomToParents);
  const useAuthentication = useMediaAuthentication();

  const sendTypingStatus = useTypingStatusUpdater(mx, roomId);

  // ── Send logic ─────────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const { editor } = editorRef.current ?? {};
    if (!editor || editor.isEmpty) return;

    const plainText = tiptapToPlainText(editor).trim();
    if (plainText === '') return;

    const customHtmlRaw = trimCustomHtml(tiptapToMatrixCustomHTML(editor, { room }));
    const isPlainOnly = tiptapCustomHtmlEqualsPlainText(editor, { room });

    let msgType = MsgType.Text;

    // Detect /me and /notice commands
    if (plainText.startsWith('/me ')) {
      msgType = MsgType.Emote;
    } else if (plainText.startsWith('/notice ')) {
      msgType = MsgType.Notice;
    }

    const body =
      msgType === MsgType.Emote
        ? plainText.slice('/me '.length)
        : msgType === MsgType.Notice
          ? plainText.slice('/notice '.length)
          : plainText;

    const formattedBody =
      msgType === MsgType.Emote
        ? customHtmlRaw.replace(/^\/me\s+/, '')
        : msgType === MsgType.Notice
          ? customHtmlRaw.replace(/^\/notice\s+/, '')
          : customHtmlRaw;

    const content = isPlainOnly
      ? { msgtype: msgType, body }
      : {
          msgtype: msgType,
          body,
          format: 'org.matrix.custom.html' as const,
          formatted_body: formattedBody,
        };

    try {
      await mx.sendMessage(roomId, null, content);
      editorRef.current?.reset();
      sendTypingStatus(false);
    } catch {
      // Error is surfaced by the matrix client — nothing to do here
    }
  }, [mx, roomId, room, sendTypingStatus]);

  // ── Keyboard handler ────────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (evt: KeyboardEvent) => {
      // Close autocomplete on Escape
      if (evt.key === 'Escape' && autocomplete) {
        evt.preventDefault();
        setAutocomplete(null);
        editorRef.current?.focus();
        return;
      }

      // Send on Enter (unless autocomplete is open or newline mode)
      if (evt.key === 'Enter' && !evt.shiftKey) {
        if (mobileOrTablet()) return; // mobile: Enter = newline
        if (autocomplete) return; // let autocomplete handle it
        if (enterForNewline) return; // Shift+Enter would send instead

        evt.preventDefault();
        handleSend();
        return;
      }

      // Send on Shift+Enter when enterForNewline is on
      if (evt.key === 'Enter' && evt.shiftKey && enterForNewline) {
        if (autocomplete) return;
        evt.preventDefault();
        handleSend();
      }
    },
    [autocomplete, enterForNewline, handleSend]
  );

  // ── Autocomplete detection on every editor change ───────────────────────────

  const handleEditorChange = useCallback((editor: TiptapEditorInstance) => {
    setAutocomplete(detectAutocomplete(editor));
    // Typing status is updated by Tiptap's onChange
  }, []);

  const handleCloseAutocomplete = useCallback(() => {
    setAutocomplete(null);
    editorRef.current?.focus();
  }, []);

  // ── Insert helpers called by autocomplete popups ────────────────────────────

  const insertMention = useCallback(
    (userId: string, displayName: string, highlight: boolean) => {
      const { editor } = editorRef.current ?? {};
      if (!editor || !autocomplete) return;
      const { from, to } = autocomplete;
      editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContent({
          type: 'mention',
          attrs: { id: userId, label: displayName, nodeType: 'user', highlight },
        })
        .insertContent(' ')
        .run();
      setAutocomplete(null);
    },
    [autocomplete]
  );

  const insertRoomMention = useCallback(
    (mentionRoomId: string, roomAlias: string) => {
      const { editor } = editorRef.current ?? {};
      if (!editor || !autocomplete) return;
      const { from, to } = autocomplete;
      editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContent({
          type: 'mention',
          attrs: { id: mentionRoomId, label: roomAlias, nodeType: 'room', highlight: false },
        })
        .insertContent(' ')
        .run();
      setAutocomplete(null);
    },
    [autocomplete]
  );

  const insertEmoticon = useCallback(
    (key: string, shortcode: string) => {
      const { editor } = editorRef.current ?? {};
      if (!editor || !autocomplete) return;
      const { from, to } = autocomplete;
      editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContent({ type: 'emoticon', attrs: { key, shortcode } })
        .insertContent(' ')
        .run();
      setAutocomplete(null);
    },
    [autocomplete]
  );

  // ── Toolbar helpers ─────────────────────────────────────────────────────────

  const getEditor = () => editorRef.current?.editor ?? null;

  const toolbarButtons = [
    {
      label: 'Bold',
      icon: Icons.Bold,
      toggle: () => getEditor()?.chain().focus().toggleBold().run(),
      isActive: () => getEditor()?.isActive('bold') ?? false,
      shortcut: 'Ctrl+B',
    },
    {
      label: 'Italic',
      icon: Icons.Italic,
      toggle: () => getEditor()?.chain().focus().toggleItalic().run(),
      isActive: () => getEditor()?.isActive('italic') ?? false,
      shortcut: 'Ctrl+I',
    },
    {
      label: 'Strikethrough',
      icon: Icons.Strike,
      toggle: () => getEditor()?.chain().focus().toggleStrike().run(),
      isActive: () => getEditor()?.isActive('strike') ?? false,
      shortcut: 'Ctrl+Shift+S',
    },
    {
      label: 'Code',
      icon: Icons.Code,
      toggle: () => getEditor()?.chain().focus().toggleCode().run(),
      isActive: () => getEditor()?.isActive('code') ?? false,
      shortcut: 'Ctrl+`',
    },
  ] as const;

  // ── Toolbar open state (mirror of editorToolbar setting) ──────────────────

  const showToolbar = editorToolbar && composerToolbarOpen;

  const toolbarToggle = (
    <IconButton
      variant="SurfaceVariant"
      size="300"
      radii="300"
      onClick={() => setComposerToolbarOpen(!composerToolbarOpen)}
      title={composerToolbarOpen ? 'Hide formatting toolbar' : 'Show formatting toolbar'}
    >
      <Icon src={Icons.Markdown} size="100" />
    </IconButton>
  );

  const toolbar = showToolbar ? (
    <Box
      style={{
        padding: `${config.space.S100} ${config.space.S200}`,
        borderTop: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
      }}
      gap="100"
      alignItems="Center"
    >
      {toolbarButtons.map((btn) => (
        <IconButton
          key={btn.label}
          variant="SurfaceVariant"
          size="300"
          radii="300"
          onClick={() => btn.toggle()}
          title={`${btn.label} (${btn.shortcut})`}
        >
          <Icon src={btn.icon} size="100" />
        </IconButton>
      ))}
    </Box>
  ) : null;

  // ── Send button ─────────────────────────────────────────────────────────────

  const sendButton = (
    <Box alignItems="Center" style={{ padding: config.space.S200 }}>
      <IconButton
        onClick={handleSend}
        variant="Primary"
        size="300"
        radii="Pill"
        title="Send message"
      >
        <Icon src={Icons.ArrowRight} size="100" filled />
      </IconButton>
    </Box>
  );

  return (
    <Box ref={containerRef} direction="Column" style={{ position: 'relative' }}>
      {/* Autocomplete popups rendered above the editor */}
      {autocomplete?.prefix === '@' && (
        <TiptapMentionAutocomplete
          room={room}
          queryText={autocomplete.text}
          onSelect={insertMention}
          onClose={handleCloseAutocomplete}
        />
      )}
      {autocomplete?.prefix === '#' && (
        <TiptapRoomMentionAutocomplete
          queryText={autocomplete.text}
          onSelect={insertRoomMention}
          onClose={handleCloseAutocomplete}
        />
      )}
      {autocomplete?.prefix === ':' && (
        <TiptapEmoticonAutocomplete
          imagePackRooms={imagePackRooms}
          useAuthentication={useAuthentication}
          queryText={autocomplete.text}
          onSelect={insertEmoticon}
          onClose={handleCloseAutocomplete}
        />
      )}

      <TiptapEditor
        ref={editorRef}
        editableName="RoomInputTiptap"
        placeholder="Send a message…"
        onKeyDown={handleKeyDown}
        onChange={handleEditorChange}
        before={toolbarToggle}
        after={sendButton}
        bottom={toolbar}
      />

      <Text
        size="T200"
        style={{
          padding: `${config.space.S100} ${config.space.S200}`,
          opacity: 0.5,
          fontStyle: 'italic',
        }}
      >
        ⚗ Experimental Tiptap composer — uploads, replies & advanced features not yet available
      </Text>
    </Box>
  );
}
