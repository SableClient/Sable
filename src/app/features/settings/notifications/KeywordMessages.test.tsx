import { render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScreenSize, ScreenSizeProvider } from '$hooks/useScreenSize';
import { SettingsLinkProvider } from '$features/settings/SettingsLinkContext';
import { KeywordMessagesNotifications } from './KeywordMessages';

vi.mock('$hooks/useAccountData', () => ({
  useAccountData: () => ({
    getContent: () => ({
      global: {
        content: [
          {
            rule_id: 'kitty',
            pattern: 'kitty',
            default: false,
            actions: [],
          },
        ],
      },
    }),
  }),
}));

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({
    addPushRule: vi.fn<() => Promise<void>>(),
    deletePushRule: vi.fn<() => Promise<void>>(),
    setPushRuleActions: vi.fn<() => Promise<void>>(),
  }),
}));

vi.mock('$hooks/useNotificationMode', () => ({
  NotificationMode: {
    Notify: 'notify',
  },
  getNotificationModeActions: () => [],
  useNotificationActionsMode: () => 'notify',
  useNotificationModeActions: () => () => [],
}));

vi.mock('$components/setting-menu-selector', () => ({
  SettingMenuSelector: () => <div>Mode</div>,
}));

vi.mock('./NotificationLevelsHint', () => ({
  NotificationLevelsHint: () => <div>Hint</div>,
}));

describe('KeywordMessagesNotifications', () => {
  it('does not show copy settings links for individual keyword rows', () => {
    const { container } = render(
      <ScreenSizeProvider value={ScreenSize.Desktop}>
        <SettingsLinkProvider value={{ section: 'notifications', baseUrl: 'https://app.example' }}>
          <KeywordMessagesNotifications />
        </SettingsLinkProvider>
      </ScreenSizeProvider>
    );

    const selectorTile = container.querySelector('[data-settings-focus="select-keyword"]');
    expect(selectorTile).not.toBeNull();
    expect(
      within(selectorTile as HTMLElement).getByRole('button', { name: /copy settings link/i })
    ).toBeInTheDocument();

    const keywordTile = container.querySelector('[data-settings-focus="keyword-kitty"]');
    expect(keywordTile).not.toBeNull();
    expect(
      within(keywordTile as HTMLElement).queryByRole('button', { name: /copy settings link/i })
    ).not.toBeInTheDocument();
  });
});
