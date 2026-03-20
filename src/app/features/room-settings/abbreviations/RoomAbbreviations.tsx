import { FormEventHandler, useCallback } from 'react';
import {
  Box,
  Button,
  Chip,
  Icon,
  IconButton,
  Icons,
  Input,
  Scroll,
  Spinner,
  Text,
  config,
} from 'folds';
import { Page, PageContent, PageHeader } from '$components/page';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useRoom } from '$hooks/useRoom';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { usePowerLevels } from '$hooks/usePowerLevels';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { useStateEvent } from '$hooks/useStateEvent';
import { useSpaceOptionally } from '$hooks/useSpace';
import { useRoomName } from '$hooks/useRoomMeta';
import { StateEvent } from '$types/matrix/room';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { MatrixError } from '$types/matrix-sdk';
import { AbbreviationEntry, RoomAbbreviationsContent } from '$utils/abbreviations';
import { SequenceCardStyle } from '$features/common-settings/styles.css';

type AbbreviationsProps = {
  requestClose: () => void;
};

export function RoomAbbreviations({ requestClose }: AbbreviationsProps) {
  const room = useRoom();
  const mx = useMatrixClient();
  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);
  const permissions = useRoomPermissions(creators, powerLevels);
  const userId = mx.getUserId() ?? '';

  const stateEvent = useStateEvent(room, StateEvent.RoomAbbreviations);
  const content = stateEvent?.getContent<RoomAbbreviationsContent>();
  const entries: AbbreviationEntry[] = Array.isArray(content?.entries) ? content.entries : [];

  // Parent space abbreviations (read-only, inherited)
  const parentSpace = useSpaceOptionally();
  const parentSpaceName = useRoomName(parentSpace ?? room);
  const spaceStateEvent = useStateEvent(parentSpace ?? room, StateEvent.RoomAbbreviations);
  const spaceContent = parentSpace
    ? spaceStateEvent?.getContent<RoomAbbreviationsContent>()
    : undefined;
  const spaceEntries: AbbreviationEntry[] = Array.isArray(spaceContent?.entries)
    ? spaceContent.entries
    : [];

  const canEdit = permissions.stateEvent(StateEvent.RoomAbbreviations, userId);

  const [saveState, saveAbbreviations] = useAsyncCallback<void, MatrixError, [AbbreviationEntry[]]>(
    useCallback(
      async (newEntries) => {
        const newContent: RoomAbbreviationsContent = { entries: newEntries };
        await mx.sendStateEvent(room.roomId, StateEvent.RoomAbbreviations as any, newContent, '');
      },
      [mx, room.roomId]
    )
  );

  const saving = saveState.status === AsyncStatus.Loading;

  const handleAdd: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (saving || !canEdit) return;
    const form = evt.target as HTMLFormElement;
    const termInput = form.elements.namedItem('term') as HTMLInputElement | null;
    const definitionInput = form.elements.namedItem('definition') as HTMLInputElement | null;
    if (!termInput || !definitionInput) return;
    const term = termInput.value.trim();
    const definition = definitionInput.value.trim();
    if (!term || !definition) return;

    const alreadyExists =
      entries.some((e) => e.term.toLowerCase() === term.toLowerCase()) ||
      spaceEntries.some((e) => e.term.toLowerCase() === term.toLowerCase());
    if (alreadyExists) {
      termInput.setCustomValidity('This term already exists.');
      termInput.reportValidity();
      return;
    }
    termInput.setCustomValidity('');

    const newEntries = [...entries, { term, definition }];
    saveAbbreviations(newEntries).then(() => {
      form.reset();
    });
  };

  const handleRemove = (index: number) => {
    if (saving || !canEdit) return;
    const newEntries = entries.filter((_, i) => i !== index);
    saveAbbreviations(newEntries);
  };

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              Abbreviations
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              {canEdit && (
                <Box direction="Column" gap="100">
                  <Text size="L400">Add Abbreviation</Text>
                  <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="400"
                  >
                    <SettingTile
                      title="New Entry"
                      description="Define a term that members can hover over to see its meaning."
                    >
                      <Box
                        style={{ marginTop: config.space.S200 }}
                        as="form"
                        onSubmit={handleAdd}
                        direction="Column"
                        gap="200"
                      >
                        <Box direction="Column" gap="100">
                          <Text size="L400">Term</Text>
                          <Input
                            name="term"
                            required
                            size="400"
                            variant="Secondary"
                            radii="300"
                            placeholder="e.g. FOSS"
                            readOnly={saving}
                          />
                        </Box>
                        <Box direction="Column" gap="100">
                          <Text size="L400">Definition</Text>
                          <Input
                            name="definition"
                            required
                            size="400"
                            variant="Secondary"
                            radii="300"
                            placeholder="e.g. Free and Open Source Software"
                            readOnly={saving}
                          />
                        </Box>
                        {saveState.status === AsyncStatus.Error && (
                          <Text size="T200" style={{ color: 'var(--mx-danger)' }}>
                            {saveState.error.message}
                          </Text>
                        )}
                        <Box gap="200" justifyContent="End">
                          <Button
                            type="submit"
                            size="300"
                            variant="Primary"
                            radii="300"
                            disabled={saving}
                            before={saving ? <Spinner size="100" variant="Primary" /> : undefined}
                          >
                            <Text size="B300">{saving ? 'Saving…' : 'Add'}</Text>
                          </Button>
                        </Box>
                      </Box>
                    </SettingTile>
                  </SequenceCard>
                </Box>
              )}

              {parentSpace && (
                <Box direction="Column" gap="100">
                  <Text size="L400">
                    {spaceEntries.length > 0
                      ? `Inherited from Space (${spaceEntries.length})`
                      : 'Inherited from Space'}
                  </Text>
                  {spaceEntries.length === 0 ? (
                    <SequenceCard
                      className={SequenceCardStyle}
                      variant="SurfaceVariant"
                      direction="Column"
                    >
                      <Text size="T300" style={{ color: 'var(--mx-surface-variant-on)' }}>
                        No abbreviations defined in {parentSpaceName}.
                      </Text>
                    </SequenceCard>
                  ) : (
                    spaceEntries.map((entry, index) => (
                      <SequenceCard
                        // eslint-disable-next-line react/no-array-index-key
                        key={index}
                        className={SequenceCardStyle}
                        variant="SurfaceVariant"
                        direction="Row"
                        gap="400"
                        alignItems="Center"
                      >
                        <Box grow="Yes" direction="Column" gap="100">
                          <Box gap="200" alignItems="Center">
                            <Text size="T300">
                              <b>{entry.term}</b>
                            </Text>
                            <Chip variant="Primary" radii="Pill" size="300">
                              <Text size="T200">Space</Text>
                            </Chip>
                          </Box>
                          <Text size="T200" style={{ opacity: 0.7 }}>
                            {entry.definition}
                          </Text>
                        </Box>
                      </SequenceCard>
                    ))
                  )}
                </Box>
              )}

              <Box direction="Column" gap="100">
                <Text size="L400">
                  {entries.length > 0
                    ? `Room Abbreviations (${entries.length})`
                    : 'Room Abbreviations'}
                </Text>
                {entries.length === 0 ? (
                  <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                  >
                    <Text size="T300" style={{ color: 'var(--mx-surface-variant-on)' }}>
                      No room-level abbreviations defined yet.
                      {canEdit && ' Use the form above to add some.'}
                    </Text>
                  </SequenceCard>
                ) : (
                  entries.map((entry, index) => (
                    <SequenceCard
                      // eslint-disable-next-line react/no-array-index-key
                      key={index}
                      className={SequenceCardStyle}
                      variant="SurfaceVariant"
                      direction="Row"
                      gap="400"
                      alignItems="Center"
                    >
                      <Box grow="Yes" direction="Column" gap="100">
                        <Text size="T300">
                          <b>{entry.term}</b>
                        </Text>
                        <Text size="T200" style={{ opacity: 0.7 }}>
                          {entry.definition}
                        </Text>
                      </Box>
                      {canEdit && (
                        <Box shrink="No">
                          <IconButton
                            onClick={() => handleRemove(index)}
                            variant="Background"
                            size="300"
                            radii="300"
                            disabled={saving}
                            aria-label={`Remove abbreviation ${entry.term}`}
                          >
                            <Icon src={Icons.Delete} size="100" />
                          </IconButton>
                        </Box>
                      )}
                    </SequenceCard>
                  ))
                )}
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
