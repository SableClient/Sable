import { MATRIX_IMAGE_SOURCE_PACK_PROPERTY_NAME } from '$types/matrix/common';
import type { MatrixReactionEvent } from '$types/matrix/common';
import type { MatrixClient } from 'matrix-js-sdk';
import { ImageUsage } from '$plugins/custom-emoji';
import { getImagePackReferencesForMxc } from './msc4459helper';

export const getReactionContent = (
  eventId: string,
  key: string,
  matrixClient: MatrixClient,
  shortcode?: string
): MatrixReactionEvent => ({
  'm.relates_to': {
    event_id: eventId,
    key,
    rel_type: 'm.annotation',
  },
  shortcode,
  'com.beeper.reaction.shortcode': shortcode,
  [MATRIX_IMAGE_SOURCE_PACK_PROPERTY_NAME]: getImagePackReferencesForMxc(
    key,
    matrixClient,
    ImageUsage.Emoticon
  ),
});
