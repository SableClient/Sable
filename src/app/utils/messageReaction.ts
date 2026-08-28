import type { MatrixReactionEvent } from '$types/matrix/common';
import type { MatrixClient, Room } from '$types/matrix-sdk';
import { RelationType } from '$types/matrix-sdk';
import { ImageUsage } from '$plugins/custom-emoji';
import { getImagePackReferencesForMxcWrappedInMap } from './msc4459helper';
import { MATRIX_UNSTABLE_IMAGE_SOURCE_PACK_PROPERTY_NAME } from '$unstable/prefixes';

export const getReactionContent = (
  eventId: string,
  key: string,
  matrixClient: MatrixClient,
  room: Room,
  shortcode?: string
): MatrixReactionEvent => ({
  'm.relates_to': {
    event_id: eventId,
    key,
    rel_type: RelationType.Annotation,
  },
  shortcode,
  'com.beeper.reaction.shortcode': shortcode,
  [MATRIX_UNSTABLE_IMAGE_SOURCE_PACK_PROPERTY_NAME]: getImagePackReferencesForMxcWrappedInMap(
    key,
    matrixClient,
    ImageUsage.Emoticon,
    room
  ),
});
