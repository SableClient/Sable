import { useSpecVersions } from './useSpecVersions';

export const useMediaAuthentication = (): boolean => {
  const { versions, unstable_features: unstableFeatures } = useSpecVersions();

  // Default to authenticated before /versions resolves (fail closed).
  if (versions.length === 0) return true;

  return unstableFeatures?.['org.matrix.msc3916.stable'] || versions.includes('v1.11');
};
