import type { SecretAccountData } from '$types/matrix/accountData';

import { useAccountData } from './useAccountData';

export const useCrossSigningActive = (): boolean => {
  const masterEvent = useAccountData('m.cross_signing.master');
  const content = masterEvent?.getContent<SecretAccountData>();

  return !!content;
};
