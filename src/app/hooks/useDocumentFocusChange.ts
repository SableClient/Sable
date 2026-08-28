import { useEffect } from 'react';
import { isWindowFocused, subscribeWindowFocus } from '$utils/dom';

export const useDocumentFocusChange = (onChange: (focus: boolean) => void) => {
  useEffect(() => {
    let localFocus = isWindowFocused();

    const handleFocus = () => {
      const focus = isWindowFocused();
      if (focus === localFocus) return;
      localFocus = focus;
      onChange(localFocus);
    };

    document.addEventListener('focusin', handleFocus);
    document.addEventListener('focusout', handleFocus);
    const unsubscribe = subscribeWindowFocus(handleFocus);
    return () => {
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('focusout', handleFocus);
      unsubscribe();
    };
  }, [onChange]);
};
