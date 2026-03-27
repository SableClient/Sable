export const REACT_QUERY_DEVTOOLS_LOCAL_STORAGE_KEY = 'sable_react_query_devtools';

export const isReactQueryDevtoolsEnabled = (): boolean =>
  import.meta.env.VITE_ENABLE_REACT_QUERY_DEVTOOLS === 'true' ||
  localStorage.getItem(REACT_QUERY_DEVTOOLS_LOCAL_STORAGE_KEY) === '1';
