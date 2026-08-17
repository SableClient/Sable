// push related unstable prefixes
// don't import this file directly, import '$unstable/prefixes'
// all defined in MSC4174 https://github.com/matrix-org/matrix-spec-proposals/pull/4174

/** unstable /versions feature flag for MSC4174 web push support */
export const MATRIX_UNSTABLE_MSC4174_FEATURE_NAME = 'org.matrix.msc4174';

/** stable capability name in /capabilities */
export const MATRIX_STABLE_MSC4174_WEBPUSH_CAPABILITY_NAME = 'm.webpush';

/** unstable capability name in /capabilities */
export const MATRIX_UNSTABLE_MSC4174_WEBPUSH_CAPABILITY_NAME = 'org.matrix.msc4174.webpush';

/** unstable pusher kind for /pushers/set */
export const MATRIX_UNSTABLE_MSC4174_WEBPUSH_PUSHER_KIND = 'org.matrix.msc4174.webpush';

/** unstable endpoint to activate a webpush pusher with its ack_token */
export const MATRIX_UNSTABLE_MSC4174_PUSHERS_ACK_PATH =
  '/_matrix/client/unstable/org.matrix.msc4174/pushers/ack';
