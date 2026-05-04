import type { Relations } from '$types/matrix-sdk';
import type { PollAnswer } from 'matrix-js-sdk/lib/@types/polls';
import { M_POLL_RESPONSE } from 'matrix-js-sdk/lib/@types/polls';

export type PollTally = {
  /** Map from answerId → vote count (deduplicated to last vote per user) */
  counts: Map<string, number>;
  /** Total number of users who cast at least one valid answer */
  totalVoters: number;
  /** The current user's selected answer IDs (empty = not voted) */
  myAnswers: string[];
};

/**
 * Pure function — tallies poll votes from a Relations object.
 *
 * Rules per MSC3381:
 * - Only the last response per user is counted.
 * - Answers that don't exist in the poll's answer list are ignored (spoiled).
 * - A response with an empty answers array is a deliberate spoil (abstain).
 */
export function tallyCounts(
  answers: PollAnswer[],
  relations: Relations | null | undefined,
  myUserId: string,
  maxSelections: number
): PollTally {
  const validIds = new Set(answers.map((a) => a.id));
  const answerIds = answers.map((a) => a.id);

  // Map userId → their last response's answer IDs (already validated)
  const lastVoteByUser = new Map<string, string[]>();

  const events = relations?.getRelations() ?? [];

  // Sort ascending so iterating gives chronological order; last write wins
  const sorted = [...events].toSorted((a, b) => a.getTs() - b.getTs());

  for (const event of sorted) {
    const sender = event.getSender();
    if (!sender) continue;

    const content = event.getContent();
    // Support both stable (m.poll.response) and unstable (org.matrix.msc3381.poll.response) keys
    const responsePart =
      (content[M_POLL_RESPONSE.name] as { answers?: unknown } | undefined) ??
      (content[M_POLL_RESPONSE.altName] as { answers?: unknown } | undefined);

    if (!responsePart || !Array.isArray(responsePart.answers)) {
      continue;
    }

    const rawAnswers = responsePart.answers as unknown[];
    // Filter to only valid answer IDs; enforce max_selections limit
    const validAnswers = (
      rawAnswers.filter((id) => typeof id === 'string' && validIds.has(id)) as string[]
    ).slice(0, Math.max(1, maxSelections));

    lastVoteByUser.set(sender, validAnswers);
  }

  const counts = new Map<string, number>(answerIds.map((id) => [id, 0]));
  let myAnswers: string[] = [];

  for (const [userId, selectedIds] of lastVoteByUser) {
    for (const id of selectedIds) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    if (userId === myUserId) {
      myAnswers = selectedIds;
    }
  }

  const totalVoters = Array.from(lastVoteByUser.values()).filter((ids) => ids.length > 0).length;

  return { counts, totalVoters, myAnswers };
}
