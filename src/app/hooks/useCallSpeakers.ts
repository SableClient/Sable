import { useEffect, useState } from 'react';
import type { CallEmbed } from '../plugins/call';

/**
 * Returns the set of Matrix user IDs currently speaking in the active call.
 * The call widget pushes the current set of active speakers to us via a
 * widget action io.element.active_speakers
 */
export const useCallSpeakers = (callEmbed?: CallEmbed): Set<string> => {
  const [speakers, setSpeakers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!callEmbed) return undefined;
    return callEmbed.onActiveSpeakers((userIds) => {
      setSpeakers(new Set(userIds));
    });
  }, [callEmbed]);

  return speakers;
};
