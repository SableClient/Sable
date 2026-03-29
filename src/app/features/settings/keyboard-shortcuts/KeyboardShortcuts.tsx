/**
 * Keyboard Shortcuts settings page.
 *
 * Lists all keyboard shortcuts available in Sable in a semantic,
 * screen-reader-friendly dl/dt/dd structure.
 */
import { Box, Icon, IconButton, Icons, Scroll, Text, config } from 'folds';
import { Page, PageContent, PageHeader } from '$components/page';

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
    typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');
  return key
    .replace(/\bmod\b/g, isMac ? '⌘' : 'Ctrl')
    .replace(/\balt\b/gi, isMac ? '⌥' : 'Alt')
    .replace(/\bshift\b/gi, '⇧')
    .replace(/\+/g, '+');
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    name: 'Navigation',
    shortcuts: [
      { keys: 'Alt+N', description: 'Jump to the highest-priority unread room' },
      { keys: 'Alt+Shift+Down', description: 'Go to next unread room (cycle)' },
      { keys: 'Alt+Shift+Up', description: 'Go to previous unread room (cycle)' },
    ],
  },
  {
    name: 'Messages',
    shortcuts: [
      { keys: 'Ctrl+Z / ⌘+Z', description: 'Undo in message editor' },
      { keys: 'Ctrl+Shift+Z / ⌘+Shift+Z', description: 'Redo in message editor' },
      { keys: 'Ctrl+B / ⌘+B', description: 'Bold' },
      { keys: 'Ctrl+I / ⌘+I', description: 'Italic' },
      { keys: 'Ctrl+U / ⌘+U', description: 'Underline' },
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
  requestClose: () => void;
};
export function KeyboardShortcuts({ requestClose }: KeyboardShortcutsProps) {
  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" as="h1" truncate>
              Keyboard Shortcuts
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton
              onClick={requestClose}
              variant="Surface"
              aria-label="Close keyboard shortcuts"
            >
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
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
    </Page>
  );
}
