import { createContext, useContext } from 'react';
import type { SpecVersions } from '../cs-api';

const EMPTY_VERSIONS: SpecVersions = { versions: [] };

const SpecVersionsContext = createContext<SpecVersions>(EMPTY_VERSIONS);

export const SpecVersionsProvider = SpecVersionsContext.Provider;

export function useSpecVersions(): SpecVersions {
  return useContext(SpecVersionsContext);
}
