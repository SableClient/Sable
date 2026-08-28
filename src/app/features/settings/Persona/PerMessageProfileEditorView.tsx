import { Box, IconButton, Text, Scroll, Chip } from 'folds';
import { ArrowLeft, composerIcon, sizedIcon, X } from '$components/icons/phosphor';
import { Page, PageHeader, PageContent } from '$components/page';
import type { PerMessageProfileEditorProps } from './PerMessageProfileEditor';
import { PerMessageProfileEditor } from './PerMessageProfileEditor';

export function PerMessageProfileEditorView({
  requestClose,
  ...editorProps
}: Readonly<PerMessageProfileEditorProps & { requestClose: () => void }>) {
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
              <Text size="T300">Persona</Text>
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
            <PerMessageProfileEditor {...editorProps} onDelete={requestClose} />
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
