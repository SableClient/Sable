import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useMatrixClient } from '$hooks/useMatrixClient';
import type { UserProfile } from '$hooks/useUserProfile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { profilesCacheAtom } from '$state/userRoomProfile';
import { Box, Switch, Text } from 'folds';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { SequenceCardStyle } from '../styles.css';
import * as prefix from '$unstable/prefixes';

type AnimalCosmeticsProps = {
  profile: UserProfile;
  userId: string;
};
export function AnimalCosmetics({ profile, userId }: Readonly<AnimalCosmeticsProps>) {
  const mx = useMatrixClient();
  const setGlobalProfiles = useSetAtom(profilesCacheAtom);
  const [renderAnimals, setRenderAnimals] = useSetting(settingsAtom, 'renderAnimals');

  const isCat =
    profile.isCat ||
    profile.extended?.[prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_IS_CAT_PROPERTY_NAME] === true;
  const hasCats =
    profile.hasCats ||
    profile.extended?.[prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_HAS_CAT_PROPERTY_NAME] === true;

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
          focusId="render-animals"
          description="Render animals as animals as opposed to normal humans."
          after={<Switch variant="Primary" value={renderAnimals} onChange={setRenderAnimals} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Is Cat"
          focusId="is-cat"
          description="Marks you as a cat."
          after={
            <Switch
              variant="Primary"
              value={isCat}
              onChange={() =>
                handleSaveField(
                  prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_IS_CAT_PROPERTY_NAME,
                  !isCat
                )
              }
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Has Cats"
          focusId="has-cats"
          description="Marks that you have cats."
          after={
            <Switch
              variant="Primary"
              value={hasCats}
              onChange={() =>
                handleSaveField(
                  prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_HAS_CAT_PROPERTY_NAME,
                  !hasCats
                )
              }
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}
