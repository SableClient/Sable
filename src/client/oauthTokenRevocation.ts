import type { ValidatedAuthMetadata } from '$types/matrix-sdk';
import { fetch } from '$utils/fetch';

type Fetch = typeof globalThis.fetch;

export const revokeOAuthToken = async (
  metadata: ValidatedAuthMetadata,
  clientId: string,
  token: string,
  tokenTypeHint: 'access_token' | 'refresh_token',
  fetchFn: Fetch = fetch
): Promise<void> => {
  const response = await fetchFn(metadata.revocation_endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      token,
      token_type_hint: tokenTypeHint,
      client_id: clientId,
    }),
  });

  if (!response.ok) {
    throw new Error(`OAuth token revocation failed (${response.status})`);
  }
};
