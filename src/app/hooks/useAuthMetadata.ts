import type { ValidatedAuthMetadata } from '$types/matrix-sdk';
import type { Session } from '$state/sessions';
import { createContext, useContext } from 'react';

const AuthMetadataContext = createContext<ValidatedAuthMetadata | undefined>(undefined);

export const AuthMetadataProvider = AuthMetadataContext.Provider;

export const getSessionAuthMetadata = (
  metadata: ValidatedAuthMetadata | undefined,
  session: Session | undefined
): ValidatedAuthMetadata | undefined => (session?.oidc ? metadata : undefined);

export const useAuthMetadata = (): ValidatedAuthMetadata | undefined => {
  const metadata = useContext(AuthMetadataContext);

  return metadata;
};
