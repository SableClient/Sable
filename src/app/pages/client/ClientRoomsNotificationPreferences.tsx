import type { ReactNode } from 'react';
import {
  RoomsNotificationPreferencesProvider,
  useRoomsNotificationPreferences,
} from '$hooks/useRoomsNotificationPreferences';

export function ClientRoomsNotificationPreferences({ children }: { children: ReactNode }) {
  const preferences = useRoomsNotificationPreferences();

  return (
    <RoomsNotificationPreferencesProvider value={preferences}>
      {children}
    </RoomsNotificationPreferencesProvider>
  );
}
