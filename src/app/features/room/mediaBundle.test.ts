import { describe, expect, it } from 'vitest';
import type { MatrixEvent } from '$types/matrix-sdk';
import { EventType } from '$types/matrix-sdk';
import type { ProcessedEvent } from '$hooks/timeline/useProcessedTimeline';
import type { IGalleryContent } from '$types/matrix/common';
import { getGalleryMediaItems, getMediaBundleEvents, isMediaEvent } from './mediaBundle';

const BASE = 1_000_000_000;

const makeEvent = ({
  id,
  sender = 'user',
  type = 'm.room.message',
  msgtype = 'm.image',
}: {
  id: string;
  sender?: string;
  type?: string;
  msgtype?: string;
}) => {
  const content: Record<string, unknown> = msgtype === undefined ? {} : { msgtype };
  return {
    getId: () => id,
    getSender: () => sender,
    getType: () => type,
    getTs: () => BASE,
    getContent: () => content,
    isRedacted: () => false,
  } as unknown as MatrixEvent;
};

const makeRow = (
  mEvent: MatrixEvent,
  collapsed: boolean,
  id = mEvent.getId() as string
): ProcessedEvent =>
  ({
    id,
    itemIndex: 0,
    mEvent,
    isRedacted: false,
    timelineSet: undefined,
    eventSender: mEvent.getSender(),
    collapsed,
    willRenderNewDivider: false,
    willRenderDayDivider: false,
    editId: undefined,
    reactionsKey: '',
    content: mEvent.getContent(),
    sendStatus: null,
  }) as unknown as ProcessedEvent;

describe('isMediaEvent', () => {
  it('accepts image and sticker events', () => {
    expect(isMediaEvent(makeEvent({ id: '$a', msgtype: 'm.image' }))).toBe(true);
    expect(isMediaEvent(makeEvent({ id: '$a', type: EventType.Sticker as string }))).toBe(true);
  });

  it('rejects non-media events', () => {
    expect(isMediaEvent(makeEvent({ id: '$a', msgtype: 'm.text' }))).toBe(false);
    expect(
      isMediaEvent(makeEvent({ id: '$a', type: EventType.RoomMember as string, msgtype: 'm.text' }))
    ).toBe(false);
  });
});

describe('getMediaBundleEvents', () => {
  it('returns the whole collapse group around a bundled event', () => {
    const rows = [
      makeRow(makeEvent({ id: '$a' }), false),
      makeRow(makeEvent({ id: '$b' }), true),
      makeRow(makeEvent({ id: '$c' }), true),
      makeRow(makeEvent({ id: '$d' }), false), // own group, >2min after $c
    ];
    expect(getMediaBundleEvents(rows, '$b').map((ev) => ev.getId())).toEqual(['$a', '$b', '$c']);
    expect(getMediaBundleEvents(rows, '$c').map((ev) => ev.getId())).toEqual(['$a', '$b', '$c']);
    expect(getMediaBundleEvents(rows, '$a').map((ev) => ev.getId())).toEqual(['$a', '$b', '$c']);
  });

  it('returns a lone event alone when it anchors its own group', () => {
    const rows = [makeRow(makeEvent({ id: '$a' }), false), makeRow(makeEvent({ id: '$b' }), false)];
    expect(getMediaBundleEvents(rows, '$b').map((ev) => ev.getId())).toEqual(['$b']);
  });

  it('skips non-media rows within a collapse group', () => {
    const rows = [
      makeRow(makeEvent({ id: '$a' }), false),
      makeRow(makeEvent({ id: '$text', msgtype: 'm.text' }), true),
      makeRow(makeEvent({ id: '$c' }), true),
    ];
    expect(getMediaBundleEvents(rows, '$a').map((ev) => ev.getId())).toEqual(['$a', '$c']);
  });

  it('does not cross a group boundary', () => {
    const rows = [
      makeRow(makeEvent({ id: '$a' }), false),
      makeRow(makeEvent({ id: '$mid', msgtype: 'm.text' }), false), // separates the groups
      makeRow(makeEvent({ id: '$b' }), false),
      makeRow(makeEvent({ id: '$c' }), true),
    ];
    expect(getMediaBundleEvents(rows, '$b').map((ev) => ev.getId())).toEqual(['$b', '$c']);
    expect(getMediaBundleEvents(rows, '$a').map((ev) => ev.getId())).toEqual(['$a']);
  });

  it('returns an empty run for an unknown or non-media event', () => {
    const rows = [
      makeRow(makeEvent({ id: '$a' }), false),
      makeRow(makeEvent({ id: '$b' }), true),
      makeRow(makeEvent({ id: '$text', msgtype: 'm.text' }), true),
    ];
    expect(getMediaBundleEvents(rows, '$nope')).toEqual([]);
    expect(getMediaBundleEvents(rows, '$text')).toEqual([]);
  });
});

describe('getGalleryMediaItems', () => {
  const gallery = (itemtypes: unknown[]): IGalleryContent =>
    ({ msgtype: 'sable.gallery', body: '', itemtypes }) as unknown as IGalleryContent;

  it('builds one synthetic-id item per gallery image', () => {
    const items = getGalleryMediaItems(
      makeEvent({ id: '$g' }),
      gallery([
        { itemtype: 'm.image', body: 'a.png', url: 'mxc://x/a' },
        { itemtype: 'm.image', body: 'b.png', url: 'mxc://x/b' },
      ]),
      'Alice'
    );
    expect(items.map((item) => item.eventId)).toEqual(['$g:0', '$g:1']);
    expect(items.map((item) => item.url)).toEqual(['mxc://x/a', 'mxc://x/b']);
    expect(items[0]).toMatchObject({ body: 'a.png', sender: 'Alice', timestamp: BASE });
  });

  it('keeps only image items and uses encrypted file urls', () => {
    const items = getGalleryMediaItems(
      makeEvent({ id: '$g' }),
      gallery([
        { itemtype: 'm.image', body: 'enc.png', file: { url: 'mxc://x/enc' } },
        { itemtype: 'm.video', body: 'v.mp4', url: 'mxc://x/v' },
        { itemtype: 'm.file', body: 'f.txt', url: 'mxc://x/f' },
      ])
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ url: 'mxc://x/enc', encInfo: { url: 'mxc://x/enc' } });
  });

  it('returns nothing without an event or for redacted events', () => {
    const content = gallery([{ itemtype: 'm.image', body: 'a.png', url: 'mxc://x/a' }]);
    expect(getGalleryMediaItems(undefined, content)).toEqual([]);
    const redacted = {
      ...makeEvent({ id: '$g' }),
      isRedacted: () => true,
    } as unknown as MatrixEvent;
    expect(getGalleryMediaItems(redacted, content)).toEqual([]);
  });
});
