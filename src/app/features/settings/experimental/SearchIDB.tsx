import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { SequenceCardStyle } from '$features/common-settings/styles.css';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Box, Input, Switch, Text, toRem } from 'folds';
import { isKeyHotkey } from 'is-hotkey';
import type { ChangeEventHandler, KeyboardEventHandler } from 'react';
import { useState } from 'react';

function MaxResultsInput({ disabled }: { disabled: boolean }) {
  const [maxCount, setMaxCount] = useSetting(settingsAtom, 'idbSearchMaxResults');
  const [inputValue, setInputValue] = useState(maxCount.toString());

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const val = evt.target.value;
    setInputValue(val);

    const parsed = Number.parseInt(val, 10);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 10) {
      setMaxCount(parsed);
    }
  };

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (evt) => {
    if (isKeyHotkey('escape', evt)) {
      evt.stopPropagation();
      setInputValue(maxCount.toString());
      (evt.target as HTMLInputElement).blur();
    }

    if (isKeyHotkey('enter', evt)) {
      (evt.target as HTMLInputElement).blur();
    }
  };

  return (
    <Input
      style={{ width: toRem(80) }}
      variant={Number.parseInt(inputValue, 10) === maxCount ? 'Secondary' : 'Success'}
      size="300"
      radii="300"
      type="number"
      min="1"
      max="10"
      value={inputValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      outlined
    />
  );
}

export function SearchIDBToggle() {
  const [enabledIdbSearchIndex, setEnabledIdbSearchIndex] = useSetting(
    settingsAtom,
    'idbSearchIndex'
  );
  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Enable Local Message Indexing</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="100"
      >
        <SettingTile
          title="Enable Local Message Indexing"
          focusId="local-message-indexing"
          description="If enabled, this will index all of your messages locally, allowing you to search through them."
          after={
            <Switch
              variant="Primary"
              value={enabledIdbSearchIndex}
              onChange={setEnabledIdbSearchIndex}
              title={
                enabledIdbSearchIndex
                  ? 'Disable indexedDB message index'
                  : 'Enable indexedDB message index'
              }
            />
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        style={{ opacity: enabledIdbSearchIndex ? 1 : 0.5 }}
      >
        <SettingTile
          title="Max Results Number"
          focusId="idb-search-max-results"
          description="Maximum number of results to return when using local search."
          after={<MaxResultsInput disabled={!enabledIdbSearchIndex} />}
        />
      </SequenceCard>
    </Box>
  );
}
