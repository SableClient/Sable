// App-facing Matrix SDK import boundary.
// Import Matrix symbols from this module instead of matrix-js-sdk directly.
export * from 'matrix-js-sdk/lib/client';
export * from 'matrix-js-sdk/lib/serverCapabilities';
export * from 'matrix-js-sdk/lib/http-api/index';
export * from 'matrix-js-sdk/lib/autodiscovery';
export * from 'matrix-js-sdk/lib/errors';
export * from 'matrix-js-sdk/lib/interactive-auth';
export * from 'matrix-js-sdk/lib/content-repo';
export * from 'matrix-js-sdk/lib/sync';
export * from 'matrix-js-sdk/lib/sliding-sync';
export * from 'matrix-js-sdk/lib/sync-accumulator';
export * from 'matrix-js-sdk/lib/scheduler';
export * from 'matrix-js-sdk/lib/store/memory';
export { createClient } from 'matrix-js-sdk/lib/matrix';

export * from 'matrix-js-sdk/lib/models/event';
export * from 'matrix-js-sdk/lib/models/room';
export * from 'matrix-js-sdk/lib/models/room-member';
export * from 'matrix-js-sdk/lib/models/room-state';
export * from 'matrix-js-sdk/lib/models/user';
export * from 'matrix-js-sdk/lib/models/search-result';
export * from 'matrix-js-sdk/lib/models/event-timeline';
export * from 'matrix-js-sdk/lib/models/event-timeline-set';
export { Relations, RelationsEvent } from 'matrix-js-sdk/lib/models/relations';

export * from 'matrix-js-sdk/lib/store/indexeddb';
export * from 'matrix-js-sdk/lib/crypto/store/indexeddb-crypto-store';
export * from 'matrix-js-sdk/lib/crypto-api/index';

export * from 'matrix-js-sdk/lib/@types/common';
export * from 'matrix-js-sdk/lib/@types/uia';
export * from 'matrix-js-sdk/lib/@types/event';
export * from 'matrix-js-sdk/lib/@types/events';
export * from 'matrix-js-sdk/lib/@types/PushRules';
export * from 'matrix-js-sdk/lib/@types/partials';
export * from 'matrix-js-sdk/lib/@types/requests';
export * from 'matrix-js-sdk/lib/@types/search';
export * from 'matrix-js-sdk/lib/@types/state_events';
export * from 'matrix-js-sdk/lib/@types/location';
export * from 'matrix-js-sdk/lib/@types/auth';
export * from 'matrix-js-sdk/lib/@types/spaces';
export * from 'matrix-js-sdk/lib/@types/read_receipts';
export * from 'matrix-js-sdk/lib/@types/membership';
export * from 'matrix-js-sdk/lib/@types/registration';

export * from 'matrix-js-sdk/lib/oidc/validate';
export { VerificationMethod } from 'matrix-js-sdk/lib/types';
export * from 'matrix-js-sdk/lib/pushprocessor';
export * from 'matrix-js-sdk/lib/common-crypto/CryptoBackend';

export * from 'matrix-js-sdk/lib/matrixrtc/CallMembership';
export * from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';

export { ThreadEvent } from 'matrix-js-sdk/lib/models/thread';
export type { Thread } from 'matrix-js-sdk/lib/models/thread';
