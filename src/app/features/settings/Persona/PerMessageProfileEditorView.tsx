import { Box, IconButton, Text, Scroll, Chip } from 'folds';
import { ArrowLeft, composerIcon, sizedIcon, X } from '$components/icons/phosphor';
import { Page, PageHeader, PageContent } from '$components/page';
import type { MatrixClient } from 'matrix-js-sdk';
import type { PronounSet } from '$utils/pronouns';
import { PerMessageProfileEditor } from './PerMessageProfileEditor';
import { useTranslation } from 'react-i18next';

type PerMessageProfileEditorViewProps = {
  mx: MatrixClient;
  profileId: string;
  avatarMxcUrl?: string;
  displayName?: string;
  pronouns?: PronounSet[];
  onChange?: (profile: { id: string; name: string; avatarUrl?: string }) => void;
  onDelete?: (profileId: string) => void;
  requestClose: () => void;
};
export function PerMessageProfileEditorView({
  mx,
  profileId,
  avatarMxcUrl,
  displayName,
  pronouns = Array<PronounSet>(),
  requestClose,
}: Readonly<PerMessageProfileEditorViewProps>) {
  const { t } = useTranslation(['settings/persona']);
  return (
    <Page>
      <PageHeader outlined={false} balance>
        <Box alignItems="Center" grow="Yes" gap="200">
          <Box alignItems="Inherit" grow="Yes" gap="200">
            <Chip
              size="500"
              radii="Pill"
              onClick={requestClose}
              before={sizedIcon(ArrowLeft, '100')}
            >
              <Text size="T300">{t('persona')}</Text>
            </Chip>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              {composerIcon(X)}
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <PerMessageProfileEditor
              mx={mx}
              profileId={profileId}
              avatarMxcUrl={avatarMxcUrl}
              displayName={displayName}
              pronouns={pronouns}
              onDelete={requestClose}
            />
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
