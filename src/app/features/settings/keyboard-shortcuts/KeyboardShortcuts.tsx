/**
 * Keyboard Shortcuts settings page.
 *
 * Lists all keyboard shortcuts available in Sable in a semantic,
 * screen-reader-friendly dl/dt/dd structure.
 */
import { Box, Scroll, Text, config } from 'folds';
import { PageContent } from '$components/page';
import { SettingsSectionPage } from '../SettingsSectionPage';
import { t } from 'i18next';

type ShortcutEntry = {
  keys: string;
  description: string;
};

type ShortcutCategory = {
  name: string;
  shortcuts: ShortcutEntry[];
};

function formatKey(key: string): string {
  const isMac =
    typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  return key
    .replace(/\bmod\b/g, isMac ? '⌘' : 'Ctrl')
    .replace(/\balt\b/gi, isMac ? '⌥' : 'Alt')
    .replace(/\bshift\b/gi, '⇧');
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    name: t('Settings.KeyboardShortcuts.navigation'),
    shortcuts: [
      { keys: 'Alt+N', description: t('Settings.KeyboardShortcuts.jump_to_the_highest_priority_unread_room') },
      { keys: 'Alt+Shift+Down', description: t('Settings.KeyboardShortcuts.go_to_next_unread_room_cycle') },
      { keys: 'Alt+Shift+Up', description: t('Settings.KeyboardShortcuts.go_to_previous_unread_room_cycle') },
    ],
  },
  {
    name: t('Settings.KeyboardShortcuts.messages'),
    shortcuts: [
      { keys: 'Ctrl+Z / ⌘+Z', description: t('Settings.KeyboardShortcuts.undo_in_message_editor') },
      { keys: 'Ctrl+Shift+Z / ⌘+Shift+Z', description: t('Settings.KeyboardShortcuts.redo_in_message_editor') },
      { keys: 'Ctrl+B / ⌘+B', description: t('Settings.KeyboardShortcuts.bold') },
      { keys: 'Ctrl+I / ⌘+I', description: t('Settings.KeyboardShortcuts.italic') },
      { keys: 'Ctrl+U / ⌘+U', description: t('Settings.KeyboardShortcuts.underline') },
    ],
  },
];

function ShortcutRow({ keys, description }: ShortcutEntry) {
  const parts = keys.split('/').map((k) => k.trim());
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: config.space.S400,
        padding: `${config.space.S100} 0`,
      }}
    >
      <Text size="T300" style={{ flex: 1, minWidth: 0 }}>
        {description}
      </Text>
      <span style={{ flexShrink: 0 }} aria-label={parts.join(' or ')}>
        {parts.map((part, i) => (
          <span key={part}>
            {part.split('+').map((seg, si, arr) => (
              <span key={seg}>
                <kbd
                  style={{
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                    padding: `0 ${config.space.S100}`,
                    borderRadius: '3px',
                    border: '1px solid currentColor',
                    opacity: 0.8,
                    fontSize: '0.85em',
                  }}
                >
                  {formatKey(seg)}
                </kbd>
                {si < arr.length - 1 && (
                  <span aria-hidden="true" style={{ margin: `0 2px` }}>
                    +
                  </span>
                )}
              </span>
            ))}
            {i < parts.length - 1 && (
              <Text
                as="span"
                size="T200"
                priority="300"
                style={{ margin: `0 ${config.space.S100}` }}
              >
                {' / '}
              </Text>
            )}
          </span>
        ))}
      </span>
    </div>
  );
}

type KeyboardShortcutsProps = {
  requestBack?: () => void;
  requestClose: () => void;
};
export function KeyboardShortcuts({ requestBack, requestClose }: KeyboardShortcutsProps) {
  return (
    <SettingsSectionPage
      title={t('Settings.KeyboardShortcuts.keyboard_shortcuts')}
      titleAs="h1"
      actionLabel={t('Settings.KeyboardShortcuts.close_keyboard_shortcuts')}
      requestBack={requestBack}
      requestClose={requestClose}
    >
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="600">
              {SHORTCUT_CATEGORIES.map((category) => (
                <Box key={category.name} direction="Column" gap="200">
                  <Text size="L400" as="h2">
                    {category.name}
                  </Text>
                  <dl style={{ margin: 0 }}>
                    {category.shortcuts.map((entry) => (
                      <div key={entry.description}>
                        <dt style={{ display: 'none' }}>{entry.keys}</dt>
                        <dd style={{ margin: 0 }}>
                          <ShortcutRow keys={entry.keys} description={entry.description} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Box>
              ))}
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
