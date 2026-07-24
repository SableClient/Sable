import { describe, expect, it } from 'vitest';
import type { ShareBatch } from '$generated/tauri/types';
import {
  collectShareFiles,
  collectShareText,
  displayFileName,
  isShareDeepLink,
  mergeShareBatches,
} from './shareContent';

const batch = (batchId: string, items: ShareBatch['items']): ShareBatch => ({ batchId, items });

describe('isShareDeepLink', () => {
  it('matches share deep links', () => {
    expect(isShareDeepLink('sable://share')).toBe(true);
    expect(isShareDeepLink('sable://share?batch=1')).toBe(true);
    expect(isShareDeepLink('sable://sso-callback')).toBe(false);
    expect(isShareDeepLink('https://example.com')).toBe(false);
  });
});

describe('mergeShareBatches', () => {
  it('appends new batches and dedupes by batchId', () => {
    const a = batch('1', [{ kind: 'text', text: 'hi' }]);
    const b = batch('2', [{ kind: 'url', text: 'https://example.com' }]);
    expect(mergeShareBatches([a], [a, b])).toEqual([a, b]);
    expect(mergeShareBatches([], [a])).toEqual([a]);
  });
});

describe('collectShareText', () => {
  it('joins text and url items across batches', () => {
    const batches = [
      batch('1', [
        { kind: 'text', text: 'hello' },
        { kind: 'file', fileName: '0-a.jpg', mime: 'image/jpeg' },
      ]),
      batch('2', [{ kind: 'url', text: 'https://example.com' }]),
    ];
    expect(collectShareText(batches)).toBe('hello\nhttps://example.com');
  });

  it('returns empty string without text items', () => {
    expect(collectShareText([batch('1', [{ kind: 'file', fileName: '0-a.jpg' }])])).toBe('');
  });
});

describe('collectShareFiles', () => {
  it('collects file refs with their batch id', () => {
    const batches = [
      batch('1', [
        { kind: 'text', text: 'hello' },
        { kind: 'file', fileName: '0-a.jpg', mime: 'image/jpeg' },
      ]),
      batch('2', [{ kind: 'file', fileName: '0-b.pdf', mime: 'application/pdf' }]),
    ];
    expect(collectShareFiles(batches)).toEqual([
      { batchId: '1', fileName: '0-a.jpg', mime: 'image/jpeg' },
      { batchId: '2', fileName: '0-b.pdf', mime: 'application/pdf' },
    ]);
  });
});

describe('displayFileName', () => {
  it('strips the staged index prefix', () => {
    expect(displayFileName('0-photo.jpg')).toBe('photo.jpg');
    expect(displayFileName('12-my-doc.pdf')).toBe('my-doc.pdf');
    expect(displayFileName('shared-0.jpg')).toBe('shared-0.jpg');
  });
});
