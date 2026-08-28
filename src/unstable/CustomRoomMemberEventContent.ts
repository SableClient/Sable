import type { ColorSet } from '$hooks/useUserProfile';
import type * as prefix from '$unstable/prefixes';
import type { KnownMembership } from 'matrix-js-sdk';

// moving the type here as the sdk is not updated to permit the changes and will not be for a very long while
export interface CustomRoomMemberEventContent {
  avatar_url?: string;
  displayname?: string;
  is_direct?: boolean;
  [prefix.MATRIX_UNSTABLE_COLORS]?: ColorSet;
  join_authorised_via_users_server?: string;
  membership: KnownMembership;
  reason?: string;
  third_party_invite?: {
    display_name: string;
    signed: {
      mxid: string;
      token: string;
      ts: number;
    };
  };
}
