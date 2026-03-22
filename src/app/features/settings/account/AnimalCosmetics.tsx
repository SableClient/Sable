import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { UserProfile } from '$hooks/useUserProfile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { profilesCacheAtom } from '$state/userRoomProfile';
import { Box, Switch, Text } from 'folds';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { SequenceCardStyle } from '../styles.css';

type AnimalCosmeticsProps = {
  profile: UserProfile;
  userId: string;
};
export function AnimalCosmetics({ profile, userId }: Readonly<AnimalCosmeticsProps>) {
  const mx = useMatrixClient();
  const setGlobalProfiles = useSetAtom(profilesCacheAtom);
  const [renderAnimals, setRenderAnimals] = useSetting(settingsAtom, 'renderAnimals');

  const isCat = profile.isCat || profile.extended?.['kitty.meow.is_cat'] === true;
  const hasCats = profile.hasCats || profile.extended?.['kitty.meow.has_cats'] === true;

  const handleSaveField = useCallback(
    async (key: string, value: boolean) => {
      await mx.setExtendedProfileProperty?.(key, value);
      setGlobalProfiles((prev) => {
        const newCache = { ...prev };
        delete newCache[userId];
        return newCache;
      });
    },
    [mx, userId, setGlobalProfiles]
  );

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Animal Identity</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Render Animals"
          description="Render animals as animals as opposed to normal humans."
          after={<Switch variant="Primary" value={renderAnimals} onChange={setRenderAnimals} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Is Cat"
          description="Marks you as a cat."
          after={
            <Switch
              variant="Primary"
              value={isCat}
              onChange={() => handleSaveField('kitty.meow.is_cat', !isCat)}
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Has Cats"
          description="Marks that you have cats."
          after={
            <Switch
              variant="Primary"
              value={hasCats}
              onChange={() => handleSaveField('kitty.meow.has_cats', !hasCats)}
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}
