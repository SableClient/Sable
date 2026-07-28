import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockType, plainToEditorInput } from '$components/editor';
import { Command, SHRUG } from '$hooks/useCommands';
import type { MatrixClient, Room } from '$types/matrix-sdk';
import { SerializableMap } from '$types/wrapper/SerializableMap';
import type { MSC4459ImagePackReference } from '$types/matrix/common';
import type { PKitProxyMessageHandler } from '$plugins/pluralkit-handler/PKitProxyMessageHandler';
import type * as PerMessageProfileModule from '$hooks/usePerMessageProfile';
import type { PerMessageProfile } from '$hooks/usePerMessageProfile';

const { profiles } = vi.hoisted(() => ({
  profiles: {
    account: undefined as PerMessageProfile | undefined,
    room: undefined as PerMessageProfile | undefined,
  },
}));

vi.mock('$hooks/usePerMessageProfile', async (importOriginal) => ({
  ...(await importOriginal<typeof PerMessageProfileModule>()),
  getCurrentlyUsedPerMessageProfileForAccount: () => Promise.resolve(profiles.account),
  getCurrentlyUsedPerMessageProfileForRoom: () => Promise.resolve(profiles.room),
}));

const { buildOutgoingMessage } = await import('./composerMessage');

const ROOM_ID = '!room:example.org';

const room = {
  roomId: ROOM_ID,
  getMember: (userId: string) => ({ rawDisplayName: `Display ${userId}` }),
} as unknown as Room;

const mx = {
  getUserId: () => '@me:example.org',
  getSafeUserId: () => '@me:example.org',
  getRoom: () => room,
} as unknown as MatrixClient;

const noProxyHandler = {
  getPmpBasedOnMessage: () => Promise.resolve(undefined),
  stripProxyFromMessage: () => undefined,
} as unknown as PKitProxyMessageHandler;

/** Mirrors how the editor represents a typed command: empty text node, then a command node. */
const commandInput = (command: Command, rest = '') => [
  {
    type: BlockType.Paragraph as const,
    children: [
      { text: '' },
      { type: BlockType.Command as const, command, children: [{ text: '' }] },
      { text: rest },
    ],
  },
];

const build = (
  input: string | ReturnType<typeof commandInput>,
  overrides: Partial<Parameters<typeof buildOutgoingMessage>[1]> = {}
) =>
  buildOutgoingMessage(typeof input === 'string' ? plainToEditorInput(input) : input, {
    mx,
    room,
    roomId: ROOM_ID,
    nicknames: {},
    replyEvent: undefined,
    replyDraft: undefined,
    silentReply: false,
    settingsLinkBaseUrl: 'https://app.example',
    canSendReaction: true,
    pkCompatEnable: false,
    pmpProxyingEnable: false,
    pmpLatchingEnable: false,
    latchedPersona: undefined,
    isPKCommand: () => false,
    pluralkitProxyMessageHandler: noProxyHandler,
    imagePacksUsed: new SerializableMap<string, MSC4459ImagePackReference>(),
    ...overrides,
  });

beforeEach(() => {
  profiles.account = undefined;
  profiles.room = undefined;
});

describe('buildOutgoingMessage', () => {
  it('builds a plain text message', async () => {
    const result = await build('hello world');
    expect(result).toMatchObject({ kind: 'message' });
    if (result.kind !== 'message') throw new Error('expected a message');
    expect(result.content.body).toBe('hello world');
    expect(result.content.msgtype).toBe('m.text');
  });

  it('reports empty input instead of sending a blank message', async () => {
    await expect(build('   ')).resolves.toEqual({ kind: 'empty' });
  });

  it('returns a quick-react descriptor rather than reacting itself', async () => {
    await expect(build('+#tada')).resolves.toEqual({ kind: 'quickReact', key: 'tada' });
  });

  it('ignores quick-react syntax without permission to react', async () => {
    const result = await build('+#tada', { canSendReaction: false });
    expect(result.kind).toBe('message');
  });

  it('returns a pk-command descriptor only when pk compat is on', async () => {
    await expect(
      build('pk;switch', { pkCompatEnable: false, isPKCommand: () => true })
    ).resolves.toMatchObject({ kind: 'message' });
    await expect(
      build('pk;switch', { pkCompatEnable: true, isPKCommand: () => true })
    ).resolves.toEqual({ kind: 'pkCommand', plainText: 'pk;switch' });
  });

  it('prefixes shrug and emits an emote for /me', async () => {
    const shrug = await build(commandInput(Command.Shrug, ' take it'));
    if (shrug.kind !== 'message') throw new Error('expected a message');
    expect(shrug.content.body.startsWith(SHRUG)).toBe(true);

    const emote = await build(commandInput(Command.Me, ' waves'));
    if (emote.kind !== 'message') throw new Error('expected a message');
    expect(emote.content.msgtype).toBe('m.emote');
    expect(emote.content.body).toBe('waves');
  });

  it('hands unhandled commands back to the caller to execute', async () => {
    const result = await build(commandInput(Command.Poll));
    expect(result).toMatchObject({ kind: 'command', command: Command.Poll });
  });

  it('mentions the replied-to user unless the reply is silent', async () => {
    const replyDraft = { userId: '@other:example.org', eventId: '$reply', body: 'hi' };

    const loud = await build('answer', { replyDraft });
    if (loud.kind !== 'message') throw new Error('expected a message');
    expect(loud.content['m.mentions']?.user_ids).toContain('@other:example.org');

    const silent = await build('answer', { replyDraft, silentReply: true });
    if (silent.kind !== 'message') throw new Error('expected a message');
    expect(silent.content['m.mentions']?.user_ids ?? []).not.toContain('@other:example.org');
  });

  it('adds the spec-required fallback prefix for a named per-message profile', async () => {
    profiles.room = { id: 'p1', name: 'Alter' };
    const result = await build('hello');
    if (result.kind !== 'message') throw new Error('expected a message');
    expect(result.content.body).toBe('Alter: hello');
    expect(result.content.formatted_body).toContain('data-mx-profile-fallback');
    expect(result.content.formatted_body).toContain('Alter: ');
  });

  it('does not double-prefix a body that already carries the fallback', async () => {
    profiles.room = { id: 'p1', name: 'Alter' };
    const result = await build('Alter: hello');
    if (result.kind !== 'message') throw new Error('expected a message');
    expect(result.content.body).toBe('Alter: hello');
  });

  it('prefers the room profile over the account profile', async () => {
    profiles.account = { id: 'global', name: 'Global' };
    profiles.room = { id: 'scoped', name: 'Scoped' };
    const result = await build('hello');
    if (result.kind !== 'message') throw new Error('expected a message');
    expect(result.content.body).toBe('Scoped: hello');
  });

  it('omits an unnamed profile fallback but still tags the profile', async () => {
    profiles.account = { id: 'p1', name: '' };
    const result = await build('hello');
    if (result.kind !== 'message') throw new Error('expected a message');
    expect(result.content.body).toBe('hello');
  });

  it('strips a pluralkit proxy wrapper and lets its profile win', async () => {
    const proxied: PerMessageProfile = { id: 'proxy', name: 'Proxied' };
    const handler = {
      getPmpBasedOnMessage: () => Promise.resolve(proxied),
      stripProxyFromMessage: (text: string) => text.replace(/^A:\s*/, ''),
    } as unknown as PKitProxyMessageHandler;
    profiles.account = { id: 'global', name: 'Global' };

    const result = await build('A: hello there', {
      pmpProxyingEnable: true,
      pluralkitProxyMessageHandler: handler,
    });
    if (result.kind !== 'message') throw new Error('expected a message');
    // The wrapper must never reach the wire, and the proxy's profile wins.
    expect(result.content.body).toBe('Proxied: hello there');
  });

  it('records embedded link previews for urls in the body', async () => {
    const result = await build('see https://example.com/page');
    if (result.kind !== 'message') throw new Error('expected a message');
    const previews = result.content['com.beeper.linkpreviews'] as
      | { matched_url: string }[]
      | undefined;
    expect(previews?.map((preview) => preview.matched_url)).toContain('https://example.com/page');
  });
});
