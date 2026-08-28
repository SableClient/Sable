import type { MatrixClient } from '$types/matrix-sdk';
import { Method, UserEvent } from '$types/matrix-sdk';
import { MATRIX_UNSTABLE_MSC4466_PROPAGATE_TO } from '$unstable/prefixes';
import type { ProfileChangePropagation } from '$state/settings';

type ProfileKey = 'avatar_url' | 'displayname';

async function setProfileInfoWithPropagation(
  mx: MatrixClient,
  key: ProfileKey,
  value: string,
  propagateTo?: ProfileChangePropagation
): Promise<void> {
  if (propagateTo === undefined) {
    if (key === 'displayname') await mx.setDisplayName(value);
    else await mx.setAvatarUrl(value);
    return;
  }

  const userId = mx.getSafeUserId();
  await mx.http.authedRequest(
    Method.Put,
    `/profile/${encodeURIComponent(userId)}/${key}`,
    { [MATRIX_UNSTABLE_MSC4466_PROPAGATE_TO]: propagateTo },
    { [key]: value }
  );

  // Match the SDK setters by immediately updating the local profile cache.
  const user = mx.getUser(userId);
  if (!user) return;

  if (key === 'displayname') {
    user.displayName = value;
    user.emit(UserEvent.DisplayName, user.events.presence, user);
  } else {
    user.avatarUrl = value;
    user.emit(UserEvent.AvatarUrl, user.events.presence, user);
  }
}

export const setDisplayNameWithPropagation = (
  mx: MatrixClient,
  displayName: string,
  propagateTo?: ProfileChangePropagation
): Promise<void> => setProfileInfoWithPropagation(mx, 'displayname', displayName, propagateTo);

export const setAvatarUrlWithPropagation = (
  mx: MatrixClient,
  avatarUrl: string,
  propagateTo?: ProfileChangePropagation
): Promise<void> => setProfileInfoWithPropagation(mx, 'avatar_url', avatarUrl, propagateTo);
