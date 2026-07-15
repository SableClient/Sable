import { useUserProfile } from '$hooks/useUserProfile';
import { useEffect } from 'react';
import { useSetting } from './hooks/settings';
import { settingsAtom } from './settings';

export const useSyncAnimalKind = (userId: string) => {
  const profile = useUserProfile(userId);
  const [animalKind, setAnimalKind] = useSetting(settingsAtom, 'animalKind');
  useEffect(() => {
    if (profile.isAnimal !== animalKind) setAnimalKind(profile.isAnimal);
  }, [setAnimalKind, profile.isAnimal, animalKind]);
};
