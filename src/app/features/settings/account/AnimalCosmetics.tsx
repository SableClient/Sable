import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import { SettingTile, SettingToggle } from '$components/setting-tile';
import { useMatrixClient } from '$hooks/useMatrixClient';
import type { UserProfile } from '$hooks/useUserProfile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { profilesCacheAtom } from '$state/userRoomProfile';
import { showToast } from '$state/toast';
import { invalidateUserProfileCache } from '$hooks/useUserProfile';
import { Box, IconButton, Input, Text } from 'folds';
import { useSetAtom } from 'jotai';
import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import * as prefix from '$unstable/prefixes';
import { menuIcon, X } from '$components/icons/phosphor';

type inputProps = {
  onSave: (newValue: unknown) => void;
  onReset?: () => void;
  initialValue?: string;
  disabled?: boolean;
  placeholder?: string;
};

function FreeInput({ initialValue: current, onSave, onReset, disabled, placeholder }: inputProps) {
  const [val, setVal] = useState(current);

  useEffect(() => {
    setVal(current ?? '');
  }, [current]);

  const handleSave = () => {
    if (val === current) return;
    onSave(val);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setVal(e.currentTarget.value);
  };

  return (
    <>
      <Input
        value={val}
        size="300"
        radii="300"
        disabled={disabled ?? false}
        variant="Secondary"
        placeholder={placeholder ?? 'Input...'}
        onChange={handleChange}
        onBlur={handleSave}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        style={{ width: '232px' }}
      />
      <Box gap="0">
        {onReset && (
          <IconButton
            size="300"
            variant="Critical"
            fill="None"
            onClick={() => {
              onReset();
              setVal('');
            }}
            radii="300"
            title="Reset"
            disabled={disabled}
          >
            {menuIcon(X)}
          </IconButton>
        )}
      </Box>
    </>
  );
}

type AnimalCosmeticsProps = {
  profile: UserProfile;
  userId: string;
};
export function AnimalCosmetics({ profile, userId }: Readonly<AnimalCosmeticsProps>) {
  const mx = useMatrixClient();
  const setGlobalProfiles = useSetAtom(profilesCacheAtom);
  const [renderAnimals, setRenderAnimals] = useSetting(settingsAtom, 'renderAnimals');
  const [, setAnimalKind] = useSetting(settingsAtom, 'animalKind');

  const isAnimal = profile.isAnimal;
  const hasAnimal = profile.hasAnimal;
  const animalNeed = profile.animalNeed;

  const handleSaveField = useCallback(
    async (key: string, value: unknown) => {
      try {
        await mx.setExtendedProfileProperty?.(key, value);
      } catch (error) {
        showToast(
          `Failed to save profile field: ${error instanceof Error ? error.message : String(error)}`
        );
        return;
      }
      invalidateUserProfileCache(mx, userId, setGlobalProfiles);
    },
    [mx, userId, setGlobalProfiles]
  );
  // this is for backwards compatibility, whenever someone will see this again, a long time from now, this will be safe to remove alongside the parent key
  useEffect(() => {
    const asyncClean = async () => {
      const isCat = profile.isCat;
      if (typeof isCat === 'boolean') {
        await handleSaveField(
          prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_IS_CAT_PROPERTY_NAME,
          null
        );
        await handleSaveField(
          prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_IS_ANIMAL_PROPERTY_NAME,
          'cat'
        );
        setAnimalKind('cat');
      }
      const hasCats = profile.hasCats;
      if (typeof hasCats === 'boolean') {
        await handleSaveField(
          prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_HAS_CAT_PROPERTY_NAME,
          null
        );
        await handleSaveField(
          prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_HAS_ANIMAL_PROPERTY_NAME,
          'cats'
        );
      }
    };
    asyncClean();
  }, [handleSaveField, profile, setAnimalKind]);

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Animal Identity</Text>
      <SettingToggle
        title="Render Animals"
        focusId="render-animals"
        description="Render animals statuses."
        value={renderAnimals}
        onChange={setRenderAnimals}
      />
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Is animal"
          focusId="is-animal"
          description="Marks which animals you are."
          after={
            <FreeInput
              initialValue={isAnimal}
              onSave={(newValue) => {
                handleSaveField(
                  prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_IS_ANIMAL_PROPERTY_NAME,
                  newValue
                );
                if (typeof newValue === 'string') setAnimalKind(newValue);
              }}
              onReset={() => {
                handleSaveField(
                  prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_IS_ANIMAL_PROPERTY_NAME,
                  null
                );
                setAnimalKind(undefined);
              }}
              placeholder="bunny..."
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Has animals"
          focusId="has-cats"
          description="Marks which animals you have"
          after={
            <FreeInput
              initialValue={hasAnimal}
              onSave={(newValue) =>
                handleSaveField(
                  prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_HAS_ANIMAL_PROPERTY_NAME,
                  newValue
                )
              }
              onReset={() =>
                handleSaveField(
                  prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_HAS_ANIMAL_PROPERTY_NAME,
                  null
                )
              }
              placeholder="sables..."
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Requires"
          focusId="animal-requires"
          description="What do you need 🥺"
          after={
            <FreeInput
              initialValue={animalNeed}
              onSave={(newValue) =>
                handleSaveField(
                  prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_ANIMAL_NEED_PROPERTY_NAME,
                  newValue
                )
              }
              onReset={() =>
                handleSaveField(
                  prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_ANIMAL_NEED_PROPERTY_NAME,
                  null
                )
              }
              placeholder="hugs..."
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}
