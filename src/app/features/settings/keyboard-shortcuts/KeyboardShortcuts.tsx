import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Scroll, Text, config } from 'folds';
import { PageContent, SettingsSectionPage } from '$components/page';
import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import {
  SHORTCUTS,
  captureShortcut,
  findShortcutConflict,
  formatShortcut,
  getShortcutBinding,
} from '../../../keyboard/shortcuts';
import type { ShortcutDefinition, ShortcutId } from '../../../keyboard/shortcuts';

const CATEGORIES = ['General', 'Navigation', 'Messages'] as const;

function ShortcutKeys({ binding }: { binding: string | null }) {
  const label = formatShortcut(binding);
  return (
    <kbd
      style={{
        fontFamily: 'monospace',
        fontWeight: 'bold',
        padding: `0 ${config.space.S100}`,
        borderRadius: '3px',
        border: '1px solid currentColor',
        opacity: binding === null ? 0.6 : 0.8,
        fontSize: '0.85em',
      }}
    >
      {label}
    </kbd>
  );
}

type ShortcutRowProps = {
  shortcut: ShortcutDefinition;
  binding: string | null;
  customized: boolean;
  editing: boolean;
  error?: string;
  onEdit: () => void;
  onReset: () => void;
};

function ShortcutRow({
  shortcut,
  binding,
  customized,
  editing,
  error,
  onEdit,
  onReset,
}: ShortcutRowProps) {
  return (
    <SettingTile
      title={shortcut.label}
      focusId={`shortcut-${shortcut.id}`}
      showSettingLinkAction={false}
      description={
        editing && !error ? 'Press a shortcut. Backspace removes it; Escape cancels.' : undefined
      }
      after={
        <Box alignItems="Center" gap="200" wrap="Wrap">
          <ShortcutKeys binding={binding} />
          <Button
            variant="Secondary"
            fill="Soft"
            outlined
            size="300"
            radii="300"
            onClick={onEdit}
            aria-label={
              editing ? `Press a new shortcut for ${shortcut.label}` : `Change ${shortcut.label}`
            }
          >
            <Text size="B300">{editing ? 'Press keys…' : 'Change'}</Text>
          </Button>
          {customized && (
            <Button
              variant="Critical"
              fill="Soft"
              outlined
              size="300"
              radii="300"
              onClick={onReset}
            >
              <Text size="B300">Reset</Text>
            </Button>
          )}
        </Box>
      }
    >
      {editing && error && (
        <Text size="T200" priority="500" aria-live="polite">
          {error}
        </Text>
      )}
    </SettingTile>
  );
}

type KeyboardShortcutsProps = {
  requestBack?: () => void;
  requestClose: () => void;
};

export function KeyboardShortcuts({ requestBack, requestClose }: KeyboardShortcutsProps) {
  const [overrides, setOverrides] = useSetting(settingsAtom, 'shortcutOverrides');
  const [editingId, setEditingId] = useState<ShortcutId>();
  const [error, setError] = useState<string>();

  const updateOverride = useCallback(
    (id: ShortcutId, binding: string | null | undefined) => {
      setOverrides((current) => {
        const next = { ...current };
        if (binding === undefined) delete next[id];
        else next[id] = binding;
        return next;
      });
      setEditingId(undefined);
      setError(undefined);
    },
    [setOverrides]
  );

  useEffect(() => {
    const id = editingId;
    if (!id) return undefined;

    const handleCapture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setEditingId(undefined);
        setError(undefined);
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        updateOverride(id, null);
        return;
      }
      const binding = captureShortcut(event);
      if (!binding) return;
      const conflict = findShortcutConflict(id, binding, overrides);
      if (conflict) {
        setError(`Already used by “${conflict.label}” in this context.`);
        return;
      }
      updateOverride(id, binding);
    };

    window.addEventListener('keydown', handleCapture, true);
    return () => window.removeEventListener('keydown', handleCapture, true);
  }, [editingId, overrides, updateOverride]);

  return (
    <SettingsSectionPage
      title="Keyboard Shortcuts"
      titleAs="h1"
      actionLabel="Close keyboard shortcuts"
      requestBack={requestBack}
      requestClose={requestClose}
    >
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="600">
              <Text size="T300" priority="300">
                Choose Change, then press a new key combination. Global shortcuts do not run while
                typing unless the action specifically supports it.
              </Text>
              {CATEGORIES.map((category) => (
                <Box key={category} direction="Column" gap="100">
                  <Text size="L400" as="h2">
                    {category}
                  </Text>
                  <Box direction="Column" gap="100">
                    {SHORTCUTS.filter((shortcut) => shortcut.category === category).map(
                      (shortcut) => (
                        <SequenceCard
                          key={shortcut.id}
                          className={SequenceCardStyle}
                          variant="SurfaceVariant"
                          direction="Column"
                        >
                          <ShortcutRow
                            shortcut={shortcut}
                            binding={getShortcutBinding(shortcut.id, overrides)}
                            customized={shortcut.id in overrides}
                            editing={editingId === shortcut.id}
                            error={editingId === shortcut.id ? error : undefined}
                            onEdit={() => {
                              setEditingId(shortcut.id);
                              setError(undefined);
                            }}
                            onReset={() => updateOverride(shortcut.id, undefined)}
                          />
                        </SequenceCard>
                      )
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
