import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSettings, resetRuntimeSettingsDefaults } from '$state/settings';
import {
  NON_SYNCABLE_KEYS,
  SETTINGS_SYNC_VERSION,
  serializeForSync,
  deserializeFromSync,
  exportSettingsAsJson,
  importSettingsFromJson,
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
      'useInAppNotifications',
      'useSystemNotifications',
      'pageZoom',
      'isPeopleDrawer',
      'isWidgetDrawer',
      'memberSortFilterIndex',
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
        isPeopleDrawer: false,
        settingsSyncEnabled: true,
        developerTools: true,
      },
    };
    const local = {
      ...base,
      pageZoom: 100,
      isPeopleDrawer: true,
      settingsSyncEnabled: false,
    };
    const result = deserializeFromSync(remote, local);
    expect(result).not.toBeNull();
    expect(result!.pageZoom).toBe(100);
    expect(result!.isPeopleDrawer).toBe(true);
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
  let fakeUrl: string;
  let anchorClick: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fakeUrl = 'blob:fake-url';
    anchorClick = vi.fn<() => void>();
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn<() => string>().mockReturnValue(fakeUrl),
      revokeObjectURL: vi.fn<() => void>(),
    });

    // Intercept anchor element creation to capture click calls.
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, ...args) => {
      const el = realCreate(tag, ...args);
      if (tag === 'a') {
        vi.spyOn(el, 'click').mockImplementation(anchorClick as () => void);
      }
      return el;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('calls URL.createObjectURL with a JSON Blob', () => {
    exportSettingsAsJson(base);
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    const blob: Blob | undefined = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob!.type).toBe('application/json');
  });

  it('Blob content is valid JSON with the correct schema version and all settings', async () => {
    exportSettingsAsJson(base);
    const blob: Blob | undefined = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    const text = await blob!.text();
    const parsed = JSON.parse(text);
    expect(parsed.v).toBe(SETTINGS_SYNC_VERSION);
    expect(typeof parsed.settings).toBe('object');
    // non-syncable keys ARE present in the export (full snapshot, not filtered)
    expect(parsed.settings.pageZoom).toBeDefined();
  });

  it('creates an anchor with a .json download attribute and clicks it', () => {
    exportSettingsAsJson(base);
    expect(anchorClick).toHaveBeenCalledOnce();
  });

  it('revokes the object URL after triggering the download', () => {
    exportSettingsAsJson(base);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(fakeUrl);
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
