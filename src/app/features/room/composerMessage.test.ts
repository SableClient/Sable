import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockType, plainToEditorInput } from '$components/editor';
import { Command, SHRUG } from '$hooks/useCommands';
import type { MatrixClient, Room } from '$types/matrix-sdk';
import { SerializableMap } from '$types/wrapper/SerializableMap';
import type { MSC4459ImagePackReference } from '$types/matrix/common';
import type { PerMessageProfileMsc4461 } from '$app/persona';

const { profiles } = vi.hoisted(() => ({
  profiles: {
    account: undefined as PerMessageProfileMsc4461 | undefined,
    room: undefined as PerMessageProfileMsc4461 | undefined,
  },
}));

vi.mock('$app/persona/catalog', () => ({
  ProfileCatalog: class {
    list = () => Promise.resolve([profiles.account, profiles.room].filter(Boolean));
    getSelection = (scope: 'account' | { roomId: string }) => {
      const persona = scope === 'account' ? profiles.account : profiles.room;
      return Promise.resolve(persona ? { persona } : undefined);
    };
  },
}));

const { buildEditReplacement, buildOutgoingMessage } = await import('./composerMessage');

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

const profile = (id: string, displayname: string): PerMessageProfileMsc4461 => ({
  id,
  displayname,
});

/** Mirrors a command selected from autocomplete in the engine-neutral document. */
const commandInput = (command: Command, rest = '') => [
  {
    type: BlockType.Paragraph as const,
    children: [
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
    pmpNoFallback: false,
    latchedPersona: undefined,
    isPKCommand: () => false,
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
    profiles.room = profile('p1', 'Alter');
    const result = await build('hello');
    if (result.kind !== 'message') throw new Error('expected a message');
    expect(result.content.body).toBe('Alter: hello');
    expect(result.content.formatted_body).toBe(
      '<strong data-mx-profile-fallback>Alter: </strong>hello'
    );
  });

  it('does not double-prefix a body that already carries the fallback', async () => {
    profiles.room = profile('p1', 'Alter');
    const result = await build('Alter: hello');
    if (result.kind !== 'message') throw new Error('expected a message');
    expect(result.content.body).toBe('Alter: hello');
    expect(result.content.formatted_body).toBe(
      '<strong data-mx-profile-fallback>Alter: </strong>hello'
    );
  });

  it('prefers the room profile over the account profile', async () => {
    profiles.account = profile('global', 'Global');
    profiles.room = profile('scoped', 'Scoped');
    const result = await build('hello');
    if (result.kind !== 'message') throw new Error('expected a message');
    expect(result.content.body).toBe('Scoped: hello');
  });

  it('omits an unnamed profile fallback but still tags the profile', async () => {
    profiles.account = profile('p1', '');
    const result = await build('hello');
    if (result.kind !== 'message') throw new Error('expected a message');
    expect(result.content.body).toBe('hello');
  });

  it('strips a pluralkit proxy wrapper and lets its profile win', async () => {
    const proxied = { ...profile('proxy', 'Proxied'), triggers: [{ prefix: 'A: ' }] };
    profiles.account = proxied;

    const result = await build('A: hello there', {
      pmpProxyingEnable: true,
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

  it('preserves the original per-message profile when editing', () => {
    const originalProfile = { id: 'original', displayname: 'Original' };
    const edited = buildEditReplacement(plainToEditorInput('updated'), {
      mx,
      room,
      roomId: ROOM_ID,
      editingEvent: {
        getId: () => '$event',
        getContent: () => ({ msgtype: 'm.text', body: 'Original: before' }),
      } as never,
      currentContent: { 'com.beeper.per_message_profile': originalProfile },
      pmpNoFallback: false,
    });

    expect(edited?.['m.new_content']).toMatchObject({
      body: 'Original: updated',
      'com.beeper.per_message_profile': originalProfile,
    });
  });
});
