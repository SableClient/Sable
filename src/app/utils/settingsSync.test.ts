import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { saveFileToDevice } = vi.hoisted(() => ({
  saveFileToDevice:
    vi.fn<
      (
        input: Blob | string,
        filename: string,
        mimeType?: string
      ) => Promise<'saved' | 'cancelled' | 'failed'>
    >(),
}));

vi.mock('$utils/download', () => ({ saveFileToDevice }));

import { getSettings, resetRuntimeSettingsDefaults } from '$state/settings';
import {
  NON_SYNCABLE_KEYS,
  SETTINGS_SYNC_VERSION,
  serializeForSync,
  deserializeFromSync,
  exportSettingsAsJson,
  importSettingsFromJson,
  prepareSettingsForSync,
} from './settingsSync';

// fixtures

let base: ReturnType<typeof getSettings>;

beforeEach(() => {
  localStorage.clear();
  resetRuntimeSettingsDefaults();
  base = getSettings();
});

// NON_SYNCABLE_KEYS

describe('NON_SYNCABLE_KEYS', () => {
  it('contains all device-local and security-sensitive keys', () => {
    const expected = [
      'usePushNotifications',
      'backgroundPushEnabled',
      'backgroundPushProvider',
      'useInAppNotifications',
      'useSystemNotifications',
      'pageZoom',
      'enterForNewline',
      'isPeopleDrawer',
      'isWidgetDrawer',
      'memberSortFilterIndex',
      'incomingCallSoundEnabled',
      'outgoingRingbackEnabled',
      'callRingtoneVolume',
      'callRingtoneId',
      'callRingbackTone',
      'callSoundOverrideGlobalNotifications',
      'developerTools',
      'settingsSyncEnabled',
    ] as const;

    expected.forEach((key) => {
      expect(NON_SYNCABLE_KEYS.has(key)).toBe(true);
    });
  });

  it('does not include ordinary syncable keys', () => {
    const syncable = [
      'twitterEmoji',
      'messageLayout',
      'urlPreview',
      'useSystemArboriumTheme',
      'arboriumThemeId',
      'arboriumLightTheme',
      'arboriumDarkTheme',
    ] as const;
    syncable.forEach((key) => {
      expect(NON_SYNCABLE_KEYS.has(key)).toBe(false);
    });
  });
});

// serializeForSync

describe('serializeForSync', () => {
  it('sets the correct schema version', () => {
    const result = serializeForSync(base);
    expect(result.v).toBe(SETTINGS_SYNC_VERSION);
  });

  it('includes syncable settings fields', () => {
    const settings = { ...base, twitterEmoji: false };
    const { settings: s } = serializeForSync(settings);
    expect(s.twitterEmoji).toBe(false);
  });

  it('strips all non-syncable keys from the payload', () => {
    const { settings: s } = serializeForSync(base);
    Array.from(NON_SYNCABLE_KEYS).forEach((key) => {
      expect(Object.hasOwn(s, key)).toBe(false);
    });
  });

  it('does not mutate the original settings object', () => {
    const original = { ...base, pageZoom: 150 };
    serializeForSync(original);
    expect(original.pageZoom).toBe(150);
  });
});

// deserializeFromSync

describe('deserializeFromSync', () => {
  it('returns null for null input', () => {
    expect(deserializeFromSync(null, base)).toBeNull();
  });

  it('returns null for non-object primitives', () => {
    expect(deserializeFromSync('string', base)).toBeNull();
    expect(deserializeFromSync(42, base)).toBeNull();
    expect(deserializeFromSync(true, base)).toBeNull();
  });

  it('returns null for an array', () => {
    expect(deserializeFromSync([], base)).toBeNull();
  });

  it('returns null when the version field is missing', () => {
    expect(deserializeFromSync({ settings: {} }, base)).toBeNull();
  });

  it('returns null when the version is wrong', () => {
    expect(deserializeFromSync({ v: 99, settings: {} }, base)).toBeNull();
    expect(deserializeFromSync({ v: 0, settings: {} }, base)).toBeNull();
  });

  it('returns null when the settings field is missing', () => {
    expect(deserializeFromSync({ v: SETTINGS_SYNC_VERSION }, base)).toBeNull();
  });

  it('returns null when the settings field is an array', () => {
    expect(deserializeFromSync({ v: SETTINGS_SYNC_VERSION, settings: [] }, base)).toBeNull();
  });

  it('returns null when the settings field is a primitive', () => {
    expect(deserializeFromSync({ v: SETTINGS_SYNC_VERSION, settings: 'bad' }, base)).toBeNull();
  });

  it('merges remote settings over local', () => {
    const remote = {
      v: SETTINGS_SYNC_VERSION,
      settings: { urlPreview: false },
    };
    const result = deserializeFromSync(remote, { ...base, urlPreview: true });
    expect(result).not.toBeNull();
    expect(result!.urlPreview).toBe(false);
  });

  it('preserves non-syncable keys from local, even if remote provides different values', () => {
    const remote = {
      v: SETTINGS_SYNC_VERSION,
      settings: {
        pageZoom: 200,
        backgroundPushEnabled: false,
        backgroundPushProvider: 'native',
        isPeopleDrawer: false,
        callRingtoneVolume: 20,
        settingsSyncEnabled: true,
        developerTools: true,
      },
    };
    const local = {
      ...base,
      pageZoom: 100,
      backgroundPushEnabled: true,
      backgroundPushProvider: 'unifiedpush' as const,
      isPeopleDrawer: true,
      callRingtoneVolume: 80,
      settingsSyncEnabled: false,
    };
    const result = deserializeFromSync(remote, local);
    expect(result).not.toBeNull();
    expect(result!.pageZoom).toBe(100);
    expect(result!.backgroundPushEnabled).toBe(true);
    expect(result!.backgroundPushProvider).toBe('unifiedpush');
    expect(result!.isPeopleDrawer).toBe(true);
    expect(result!.callRingtoneVolume).toBe(80);
    expect(result!.settingsSyncEnabled).toBe(false);
    expect(result!.developerTools).toBe(false);
  });

  it('round-trips through serialize then deserialize correctly', () => {
    const tweaked = { ...base, hour24Clock: true };
    const payload = serializeForSync(tweaked);
    const result = deserializeFromSync(payload, base);
    expect(result).not.toBeNull();
    expect(result!.hour24Clock).toBe(true);
    // non-syncable comes from base, not tweaked (pageZoom etc. same anyway)
    expect(result!.settingsSyncEnabled).toBe(base.settingsSyncEnabled);
  });

  it('round-trips embedded local tweak CSS without changing the sync version', () => {
    const tweakUrl = 'sable-import://tweak/restored/full.sable.css';
    const tweaked = {
      ...base,
      themeRemoteTweakFavorites: [
        { fullUrl: tweakUrl, displayName: 'Restored', basename: 'restored', cssText: 'body {}' },
      ],
    };
    const payload = serializeForSync(tweaked);
    expect(payload.v).toBe(SETTINGS_SYNC_VERSION);
    expect(payload.settings.themeRemoteTweakFavorites?.[0]?.cssText).toBe('body {}');
    expect(deserializeFromSync(payload, base)?.themeRemoteTweakFavorites[0]?.cssText).toBe(
      'body {}'
    );
  });

  it('atomically excludes local tweaks beyond the aggregate CSS budget and their enabled URLs', () => {
    const firstUrl = 'sable-import://tweak/first/full.sable.css';
    const secondUrl = 'sable-import://tweak/second/full.sable.css';
    const prepared = prepareSettingsForSync({
      ...base,
      themeRemoteTweakFavorites: [
        {
          fullUrl: firstUrl,
          displayName: 'First',
          basename: 'first',
          cssText: 'a'.repeat(256 * 1024),
        },
        { fullUrl: secondUrl, displayName: 'Second', basename: 'second', cssText: 'b' },
      ],
      themeRemoteEnabledTweakFullUrls: [firstUrl, secondUrl],
    });
    expect(prepared.excludedLocalTweakUrls).toEqual([secondUrl]);
    expect(
      prepared.content.settings.themeRemoteTweakFavorites?.map((favorite) => favorite.fullUrl)
    ).toEqual([firstUrl]);
    expect(prepared.content.settings.themeRemoteEnabledTweakFullUrls).toEqual([firstUrl]);
  });

  it('preserves locally excluded oversized tweaks and enabled URLs during a remote merge', () => {
    const oversizedUrl = 'sable-import://tweak/oversized/full.sable.css';
    const current = {
      ...base,
      themeRemoteTweakFavorites: [
        {
          fullUrl: oversizedUrl,
          displayName: 'Oversized',
          basename: 'oversized',
          cssText: 'x'.repeat(256 * 1024 + 1),
        },
      ],
      themeRemoteEnabledTweakFullUrls: [oversizedUrl],
    };
    const result = deserializeFromSync(
      {
        v: SETTINGS_SYNC_VERSION,
        settings: {
          themeRemoteTweakFavorites: [
            {
              fullUrl: 'https://example.test/remote.css',
              displayName: 'Remote',
              basename: 'remote',
            },
          ],
          themeRemoteEnabledTweakFullUrls: ['https://example.test/remote.css'],
        },
      },
      current
    );
    expect(result?.themeRemoteTweakFavorites.map((favorite) => favorite.fullUrl)).toEqual([
      'https://example.test/remote.css',
      oversizedUrl,
    ]);
    expect(result?.themeRemoteEnabledTweakFullUrls).toEqual([
      'https://example.test/remote.css',
      oversizedUrl,
    ]);

    const enabledOnlyResult = deserializeFromSync(
      {
        v: SETTINGS_SYNC_VERSION,
        settings: { themeRemoteEnabledTweakFullUrls: ['https://example.test/remote.css'] },
      },
      current
    );
    expect(enabledOnlyResult?.themeRemoteEnabledTweakFullUrls).toEqual([
      'https://example.test/remote.css',
      oversizedUrl,
    ]);
  });

  it('drops embedded CSS for remote tweak URLs without dropping local CSS', () => {
    const remote = {
      v: SETTINGS_SYNC_VERSION,
      settings: {
        themeRemoteTweakFavorites: [
          {
            fullUrl: 'https://example.test/tweak.sable.css',
            displayName: 'Remote',
            basename: 'remote',
            cssText: 'body {}',
          },
          {
            fullUrl: 'sable-import://tweak/local/full.sable.css',
            displayName: 'Local',
            basename: 'local',
            cssText: 'body {}',
          },
        ],
      },
    };
    expect(deserializeFromSync(remote, base)?.themeRemoteTweakFavorites).toEqual([
      {
        fullUrl: 'https://example.test/tweak.sable.css',
        displayName: 'Remote',
        basename: 'remote',
      },
      {
        fullUrl: 'sable-import://tweak/local/full.sable.css',
        displayName: 'Local',
        basename: 'local',
        cssText: 'body {}',
      },
    ]);
  });

  it('preserves body-less legacy local records for a source device to backfill later', () => {
    const tweakUrl = 'sable-import://tweak/legacy/full.sable.css';
    const remote = {
      v: SETTINGS_SYNC_VERSION,
      settings: {
        themeRemoteTweakFavorites: [
          { fullUrl: tweakUrl, displayName: 'Legacy', basename: 'legacy' },
        ],
        themeRemoteEnabledTweakFullUrls: [tweakUrl],
      },
    };
    expect(
      deserializeFromSync(remote, {
        ...base,
        themeRemoteTweakFavorites: [{ fullUrl: tweakUrl, displayName: 'Local', basename: 'local' }],
      })?.themeRemoteTweakFavorites
    ).toHaveLength(1);
    const restored = deserializeFromSync(remote, base);
    expect(restored?.themeRemoteTweakFavorites).toHaveLength(1);
    expect(restored?.themeRemoteEnabledTweakFullUrls).toEqual([tweakUrl]);
  });

  it('preserves structured v1 settings during deserialization', () => {
    const result = deserializeFromSync(
      {
        v: SETTINGS_SYNC_VERSION,
        settings: { perRoomShowRoomIcon: { '!room:example': 'always' } },
      },
      base
    );
    expect(result?.perRoomShowRoomIcon).toEqual({ '!room:example': 'always' });
  });

  it('falls back safely for malformed tweak fields and sanitizes enabled URLs', () => {
    const current = {
      ...base,
      themeRemoteTweakFavorites: [
        { fullUrl: 'https://example.test/ok.css', displayName: 'Ok', basename: 'ok' },
      ],
    };
    const result = deserializeFromSync(
      {
        v: SETTINGS_SYNC_VERSION,
        settings: {
          themeRemoteTweakFavorites: { bad: true },
          themeRemoteEnabledTweakFullUrls: [
            ' https://example.test/ok.css ',
            4,
            '',
            'x'.repeat(8193),
          ],
        },
      },
      current
    );
    expect(result?.themeRemoteTweakFavorites).toEqual(current.themeRemoteTweakFavorites);
    expect(result?.themeRemoteEnabledTweakFullUrls).toEqual(['https://example.test/ok.css']);
  });

  it('ignores extra unknown keys in the remote payload', () => {
    const remote = {
      v: SETTINGS_SYNC_VERSION,
      settings: { twitterEmoji: false, __unknown: 'surprise' },
    };
    const result = deserializeFromSync(remote, base);
    expect(result).not.toBeNull();
    expect(result!.twitterEmoji).toBe(false);
  });
});

// exportSettingsAsJson

describe('exportSettingsAsJson', () => {
  beforeEach(() => {
    saveFileToDevice.mockResolvedValue('saved');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('saves a JSON file through the cross-platform downloader', () => {
    exportSettingsAsJson(base);
    expect(saveFileToDevice).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.stringMatching(/^sable-settings-\d+\.json$/),
      'application/json'
    );
  });

  it('saves valid JSON with the correct schema version and all settings', async () => {
    exportSettingsAsJson(base);
    const blob = saveFileToDevice.mock.calls[0]?.[0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob!.type).toBe('application/json');
    const text = await blob!.text();
    const parsed = JSON.parse(text);
    expect(parsed.v).toBe(SETTINGS_SYNC_VERSION);
    expect(typeof parsed.settings).toBe('object');
    // non-syncable keys ARE present in the export (full snapshot, not filtered)
    expect(parsed.settings.pageZoom).toBeDefined();
  });
});

// importSettingsFromJson

describe('importSettingsFromJson', () => {
  let changeListener: ((ev: Event) => void) | null;
  let mockInput: {
    type: string;
    accept: string;
    files: FileList | null;
    addEventListener: (type: string, listener: (ev: Event) => void) => void;
    click: () => void;
  };

  beforeEach(() => {
    changeListener = null;
    mockInput = {
      type: '',
      accept: '',
      files: null,
      addEventListener: vi.fn<(type: string, listener: (ev: Event) => void) => void>(
        (type: string, listener: (ev: Event) => void) => {
          if (type === 'change') {
            changeListener = listener;
          }
        }
      ),
      click: vi.fn<() => void>(),
    };

    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, ...args) => {
      if (tag === 'input') return mockInput as unknown as HTMLInputElement;
      return realCreate(tag, ...args);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves null when no file is selected (empty files list)', async () => {
    // Start the promise, then immediately trigger onchange with no file.
    const promise = importSettingsFromJson(base);
    changeListener?.(new Event('change'));
    await expect(promise).resolves.toBeNull();
  });

  it('resolves merged settings when a valid JSON file is provided', async () => {
    const payload = {
      v: SETTINGS_SYNC_VERSION,
      settings: { twitterEmoji: false },
    };
    const fileContent = JSON.stringify(payload);
    const file = new File([fileContent], 'settings.json', {
      type: 'application/json',
    });

    // Build a minimal FileList-like object.
    const fakeFileList = {
      0: file,
      length: 1,
      item: () => file,
    } as unknown as FileList;
    mockInput.files = fakeFileList;

    const promise = importSettingsFromJson({ ...base, twitterEmoji: true });

    // Trigger the change event; the file reader will asynchronously call onload.
    changeListener?.(new Event('change'));

    const result = await promise;
    expect(result).not.toBeNull();
    expect(result!.twitterEmoji).toBe(false);
  });

  it('resolves null when the file contains invalid JSON', async () => {
    const file = new File(['not json {{'], 'bad.json', {
      type: 'application/json',
    });
    const fakeFileList = {
      0: file,
      length: 1,
      item: () => file,
    } as unknown as FileList;
    mockInput.files = fakeFileList;

    const promise = importSettingsFromJson(base);
    changeListener?.(new Event('change'));

    await expect(promise).resolves.toBeNull();
  });

  it('resolves null when the JSON has an incompatible schema version', async () => {
    const payload = { v: 99, settings: { twitterEmoji: false } };
    const file = new File([JSON.stringify(payload)], 'settings.json', {
      type: 'application/json',
    });
    const fakeFileList = {
      0: file,
      length: 1,
      item: () => file,
    } as unknown as FileList;
    mockInput.files = fakeFileList;

    const promise = importSettingsFromJson(base);
    changeListener?.(new Event('change'));

    await expect(promise).resolves.toBeNull();
  });
});
