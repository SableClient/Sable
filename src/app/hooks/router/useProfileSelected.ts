import { useMatch } from 'react-router-dom';
import { getProfilePath } from '$pages/pathUtils';

export const useProfileSelected = (): boolean => {
  const match = useMatch({
    path: getProfilePath(),
    caseSensitive: true,
    end: false,
  });

  return !!match;
};
