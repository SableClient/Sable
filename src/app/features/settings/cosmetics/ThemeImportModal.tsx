import { type ChangeEventHandler, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
  config,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
  toRem,
} from 'folds';

import { useSetting } from '$state/hooks/settings';
import { settingsAtom, type ThemeRemoteFavorite } from '$state/settings';
import { stopPropagation } from '$utils/keyboard';

import { SequenceCardStyle } from '$features/settings/styles.css';
import { SequenceCard } from '$components/sequence-card';
import {
  processImportedHttpsUrl,
  processPastedOrUploadedCss,
  type ProcessedThemeImport,
} from '../../../theme/processThemeImport';

import { usePatchSettings } from './themeSettingsPatch';

type ThemeImportModalProps = {
  open: boolean;
  onClose: () => void;
};

export function ThemeImportModal({ open, onClose }: ThemeImportModalProps) {
  const patchSettings = usePatchSettings();
  const [favorites] = useSetting(settingsAtom, 'themeRemoteFavorites');
  const [manualRemoteFullUrl] = useSetting(settingsAtom, 'themeRemoteManualFullUrl');
  const [lightRemoteFullUrl] = useSetting(settingsAtom, 'themeRemoteLightFullUrl');
  const [darkRemoteFullUrl] = useSetting(settingsAtom, 'themeRemoteDarkFullUrl');

  const [importUrl, setImportUrl] = useState('');
  const [importPaste, setImportPaste] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importFileName, setImportFileName] = useState<string | undefined>(undefined);
  const importFileRef = useRef<HTMLInputElement>(null);

  const activeUrls = useMemo(
    () =>
      [manualRemoteFullUrl, lightRemoteFullUrl, darkRemoteFullUrl].filter((u): u is string =>
        Boolean(u && u.trim().length > 0)
      ),
    [darkRemoteFullUrl, lightRemoteFullUrl, manualRemoteFullUrl]
  );

  const pruneFavorites = useCallback(
    (nextFavorites: ThemeRemoteFavorite[], nextActiveUrls: string[]) => {
      const active = new Set(nextActiveUrls);
      return nextFavorites.filter((f) => f.pinned === true || active.has(f.fullUrl));
    },
    []
  );

  useEffect(() => {
    if (!open) {
      setImportUrl('');
      setImportPaste('');
      setImportError(null);
      setImportFileName(undefined);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  }, [open]);

  const onImportUrlChange: ChangeEventHandler<HTMLInputElement> = (e) =>
    setImportUrl(e.target.value);

  const onImportPasteChange: ChangeEventHandler<HTMLTextAreaElement> = (e) =>
    setImportPaste(e.target.value);

  const addImportedFavorite = useCallback(
    (r: Extract<ProcessedThemeImport, { ok: true }>) => {
      const existing = favorites.find((f) => f.fullUrl === r.fullUrl);
      if (existing) {
        setImportError('That theme is already saved.');
        return;
      }
      const next: ThemeRemoteFavorite = {
        fullUrl: r.fullUrl,
        displayName: r.displayName,
        basename: r.basename,
        kind: r.kind,
        pinned: true,
        importedLocal: r.importedLocal,
      };
      const nextActive = Array.from(
        new Set(
          [...activeUrls, r.fullUrl].filter((u): u is string => Boolean(u && u.trim().length > 0))
        )
      );
      patchSettings({
        themeRemoteFavorites: pruneFavorites([...favorites, next], nextActive),
      });
      onClose();
    },
    [activeUrls, favorites, onClose, patchSettings, pruneFavorites]
  );

  const onImportFileChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setImportPaste(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.readAsText(file);
  };

  const handleImportTheme = useCallback(async () => {
    setImportError(null);
    const urlTrim = importUrl.trim();
    if (/^https:\/\//i.test(urlTrim)) {
      setImportBusy(true);
      try {
        const result = await processImportedHttpsUrl(urlTrim);
        if (!result.ok) {
          setImportError(result.error);
          return;
        }
        addImportedFavorite(result);
      } finally {
        setImportBusy(false);
      }
      return;
    }
    const pasted = importPaste.trim();
    if (!pasted) {
      setImportError('Enter an HTTPS URL, paste CSS, or choose a file.');
      return;
    }
    setImportBusy(true);
    try {
      const result = await processPastedOrUploadedCss(pasted, importFileName);
      if (!result.ok) {
        setImportError(result.error);
        return;
      }
      addImportedFavorite(result);
    } finally {
      setImportBusy(false);
    }
  }, [addImportedFavorite, importFileName, importPaste, importUrl]);

  const dismissSafe = useCallback(() => {
    if (importBusy) return;
    onClose();
  }, [importBusy, onClose]);

  if (!open) return null;

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: dismissSafe,
            clickOutsideDeactivates: false,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface" aria-labelledby="theme-import-title">
            <Header
              style={{
                padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                borderBottomWidth: config.borderWidth.B300,
              }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text id="theme-import-title" size="H4">
                  Import a theme
                </Text>
              </Box>
              <IconButton
                size="300"
                radii="300"
                onClick={dismissSafe}
                disabled={importBusy}
                aria-label="Close"
              >
                <Icon src={Icons.Cross} size="100" />
              </IconButton>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
              <Text priority="400">
                Paste a link to a theme file, or paste CSS / upload a .css file. Files from your
                device stay local. HTTPS links are treated like other remote themes.
              </Text>
              <SequenceCard
                className={SequenceCardStyle}
                variant="SurfaceVariant"
                direction="Column"
                gap="300"
              >
                <Input
                  size="300"
                  radii="300"
                  outlined
                  placeholder="https://… (optional if importing from CSS below)"
                  value={importUrl}
                  onChange={onImportUrlChange}
                />
                <textarea
                  value={importPaste}
                  onChange={onImportPasteChange}
                  placeholder="Paste .preview.sable.css or .sable.css text, or pick a file below…"
                  rows={6}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: toRem(10),
                    borderRadius: toRem(8),
                    border: `${toRem(1)} solid var(--sable-surface-container-line)`,
                    background: 'var(--sable-surface-container)',
                    color: 'inherit',
                    font: 'inherit',
                    resize: 'vertical',
                    minHeight: toRem(120),
                  }}
                />
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".css,text/css"
                  style={{ display: 'none' }}
                  onChange={onImportFileChange}
                />
                <Box direction="Row" gap="200" wrap="Wrap" alignItems="Center">
                  <Button
                    variant="Secondary"
                    size="300"
                    radii="300"
                    disabled={importBusy}
                    onClick={() => importFileRef.current?.click()}
                  >
                    <Text size="B300">Choose .css file</Text>
                  </Button>
                  <Button
                    variant="Primary"
                    size="300"
                    radii="300"
                    disabled={importBusy}
                    onClick={() => {
                      handleImportTheme().catch(() => undefined);
                    }}
                  >
                    <Text size="B300">{importBusy ? 'Importing…' : 'Import'}</Text>
                  </Button>
                </Box>
                {importError && (
                  <Text size="T300" style={{ color: 'var(--sable-error)' }}>
                    {importError}
                  </Text>
                )}
              </SequenceCard>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
