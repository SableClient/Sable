import { useMatch } from 'react-router-dom';
import { getNavigatePath } from '$pages/pathUtils';

export const useNavigateSelected = (): boolean => {
  const match = useMatch({
    path: getNavigatePath(),
    caseSensitive: true,
    end: false,
  });

  return !!match;
};
