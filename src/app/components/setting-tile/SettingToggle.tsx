import type { ReactNode } from 'react';
import { Switch } from 'folds';
import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import { SettingTile } from './SettingTile';

type SettingToggleProps = {
  title: string;
  focusId: string;
  description?: ReactNode;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  switchVariant?: 'Primary' | 'Secondary';
  ariaLabel?: string;
  switchTitle?: string;
};

export function SettingToggle({
  title,
  focusId,
  description,
  value,
  onChange,
  disabled,
  switchVariant,
  ariaLabel,
  switchTitle,
}: SettingToggleProps) {
  return (
    <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
      <SettingTile
        title={title}
        focusId={focusId}
        description={description}
        after={
          <Switch
            variant={switchVariant ?? 'Primary'}
            value={value}
            onChange={onChange}
            disabled={disabled}
            aria-label={ariaLabel ?? focusId}
            title={switchTitle}
          />
        }
      />
    </SequenceCard>
  );
}
