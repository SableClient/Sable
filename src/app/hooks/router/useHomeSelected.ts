import { useMatch } from 'react-router-dom';
import {
  getHomeCreatePath,
  getHomeJoinPath,
  getHomePath,
  getHomeSearchPath,
  getHomeBookmarksPath,
} from '$pages/pathUtils';

export const useHomeSelected = (): boolean => {
  const homeMatch = useMatch({
    path: getHomePath(),
    caseSensitive: true,
    end: false,
  });

  return !!homeMatch;
};

export const useHomeCreateSelected = (): boolean => {
  const match = useMatch({
    path: getHomeCreatePath(),
    caseSensitive: true,
    end: false,
  });

  return !!match;
};

export const useHomeJoinSelected = (): boolean => {
  const match = useMatch({
    path: getHomeJoinPath(),
    caseSensitive: true,
    end: false,
  });

  return !!match;
};

export const useHomeSearchSelected = (): boolean => {
  const match = useMatch({
    path: getHomeSearchPath(),
    caseSensitive: true,
    end: false,
  });

  return !!match;
};

export const useHomeBookmarksSelected = (): boolean => {
  const match = useMatch({
    path: getHomeBookmarksPath(),
    caseSensitive: true,
    end: false,
  });

  return !!match;
};
