import type { ChangeEvent } from 'react';
import { useState, useEffect } from 'react';
import { Input } from 'folds';
import { SettingTile } from '$components/setting-tile';
import type { PronounSet } from '$utils/pronouns';
import { parsePronounsInput } from '$utils/pronouns';
import { useTranslation } from 'react-i18next';

type PronounEditorProps = {
  title: string;
  current: PronounSet[];
  onSave: (p: PronounSet[]) => void;
  disabled?: boolean;
};

export function PronounEditor({ title, current, onSave, disabled }: PronounEditorProps) {
      const { t } = useTranslation(['settings/persona']);
  const initialString = Array.isArray(current)
    ? current.map((p) => `${p.language ? `${p.language}:` : ''}${p.summary}`).join(', ')
    : '';
  const [val, setVal] = useState(initialString);

  useEffect(() => setVal(initialString), [initialString]);

  const handleSave = () => {
    if (val === initialString) return;
    const safeVal = val.slice(0, 128);
    const next = parsePronounsInput(safeVal);
    onSave(next);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setVal(e.currentTarget.value);
  };

  return (
    <SettingTile
      title={title}
      focusId="pronouns"
      // let people specify multiple sets of pronouns for different languages
      // the input is a comma separated list of pronoun sets, each set can have an optional language tag (e.g. "en:they/them, de:sie/ihr")
      description={t('pronouns_placeholder')}
      after={
        <Input
          value={val}
          size="300"
          radii="300"
          disabled={disabled ?? false}
          variant="Secondary"
          placeholder={t('pronouns_input')}
          onChange={handleChange}
          onBlur={handleSave}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          style={{ width: '232px' }}
        />
      }
    />
  );
}
