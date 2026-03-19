/**
 * Tests for the ThreadIndicator visibility condition in the compose strip.
 *
 * The indicator renders when a user is replying to a thread message from the
 * main timeline (no threadRootId). It must NOT appear when composing inside
 * the ThreadDrawer (threadRootId is set), because the drawer already makes the
 * thread context obvious.
 *
 * Mirrors the exact render guard in RoomInput.tsx:
 *   {replyDraft.relation?.rel_type === RelationType.Thread && !threadRootId && (
 *     <ThreadIndicator />
 *   )}
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RelationType } from '$types/matrix-sdk';
import { ThreadIndicator } from './Reply';

function Subject({ relType, threadRootId }: { relType?: string; threadRootId?: string }) {
  return <>{relType === RelationType.Thread && !threadRootId && <ThreadIndicator />}</>;
}

describe('ThreadIndicator visibility in compose strip', () => {
  it('renders in the main timeline compose box when a thread relation is active', () => {
    render(<Subject relType={RelationType.Thread} />);
    expect(screen.getByText('Thread')).toBeInTheDocument();
  });

  it('is hidden inside the ThreadDrawer when threadRootId is set', () => {
    render(<Subject relType={RelationType.Thread} threadRootId="$root:example.com" />);
    expect(screen.queryByText('Thread')).not.toBeInTheDocument();
  });

  it('is hidden when the draft has no relation', () => {
    render(<Subject relType={undefined} />);
    expect(screen.queryByText('Thread')).not.toBeInTheDocument();
  });

  it('is hidden for a non-thread relation type', () => {
    render(<Subject relType="m.in_reply_to" />);
    expect(screen.queryByText('Thread')).not.toBeInTheDocument();
  });
});
