import type { FormEventHandler } from 'react';
import { useCallback, useMemo } from 'react';
import { useAtomValue } from 'jotai';
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
import { useStateEventCallback } from '$hooks/useStateEventCallback';
import { useForceUpdate } from '$hooks/useForceUpdate';

import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import type { MatrixError } from '$types/matrix-sdk';
import type { AbbreviationEntry, RoomAbbreviationsContent } from '$utils/abbreviations';
import { getAllParents, getStateEvent } from '$utils/room';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { SequenceCardStyle } from '$features/common-settings/styles.css';
import { CustomStateEvent } from '$types/matrix/room';

type AbbreviationsProps = {
  requestClose: () => void;
  isSpace?: boolean;
};

export function RoomAbbreviations({ requestClose, isSpace }: AbbreviationsProps) {
  const room = useRoom();
  const mx = useMatrixClient();
  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);
  const permissions = useRoomPermissions(creators, powerLevels);
  const userId = mx.getUserId() ?? '';

  const stateEvent = useStateEvent(room, CustomStateEvent.RoomAbbreviations);
  const content = stateEvent?.getContent<RoomAbbreviationsContent>();
  const entries: AbbreviationEntry[] = Array.isArray(content?.entries) ? content.entries : [];

  // Ancestor space abbreviations (read-only, inherited) — full multi-level support
  const roomToParents = useAtomValue(roomToParentsAtom);
  const [ancestorUpdateCount, forceAncestorUpdate] = useForceUpdate();

  useStateEventCallback(
    mx,
    useCallback(
      (event) => {
        if (event.getType() !== (CustomStateEvent.RoomAbbreviations as string)) return;
        const eventRoomId = event.getRoomId();
        if (eventRoomId && getAllParents(roomToParents, room.roomId).has(eventRoomId)) {
          forceAncestorUpdate();
        }
      },
      [room.roomId, roomToParents, forceAncestorUpdate]
    )
  );

  type SpaceEntryGroup = { spaceId: string; spaceName: string; entries: AbbreviationEntry[] };
  const ancestorGroups = useMemo((): SpaceEntryGroup[] => {
    void ancestorUpdateCount;
    return Array.from(getAllParents(roomToParents, room.roomId)).reduce<SpaceEntryGroup[]>(
      (groups, parentId) => {
        const parentRoom = mx.getRoom(parentId);
        if (!parentRoom) return groups;
        const ev = getStateEvent(parentRoom, CustomStateEvent.RoomAbbreviations);
        const c = ev?.getContent<RoomAbbreviationsContent>();
        const parentEntries: AbbreviationEntry[] = Array.isArray(c?.entries) ? c.entries : [];
        if (parentEntries.length > 0) {
          groups.push({
            spaceId: parentId,
            spaceName: parentRoom.name,
            entries: parentEntries,
          });
        }
        return groups;
      },
      []
    );
  }, [mx, roomToParents, room.roomId, ancestorUpdateCount]);
  const allAncestorEntries = useMemo(
    () => ancestorGroups.flatMap((g) => g.entries),
    [ancestorGroups]
  );

  const canEdit = permissions.stateEvent(CustomStateEvent.RoomAbbreviations, userId);

  const [saveState, saveAbbreviations] = useAsyncCallback<void, MatrixError, [AbbreviationEntry[]]>(
    useCallback(
      async (newEntries) => {
        const newContent: RoomAbbreviationsContent = { entries: newEntries };
        await mx.sendStateEvent(room.roomId, CustomStateEvent.RoomAbbreviations, newContent, '');
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
      allAncestorEntries.some((e) => e.term.toLowerCase() === term.toLowerCase());
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
                        gap="400"
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
                            onChange={(e) => e.currentTarget.setCustomValidity('')}
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
                        <Box gap="200">
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

              <Box direction="Column" gap="100">
                {(() => {
                  const totalCount = entries.length + (isSpace ? 0 : allAncestorEntries.length);
                  const label = isSpace ? 'Space' : 'Room';
                  return (
                    <>
                      <Text size="L400">
                        {totalCount > 0
                          ? `${label} Abbreviations (${totalCount})`
                          : `${label} Abbreviations`}
                      </Text>
                      {totalCount === 0 ? (
                        <SequenceCard
                          className={SequenceCardStyle}
                          variant="SurfaceVariant"
                          direction="Column"
                        >
                          <Text
                            size="T300"
                            style={{
                              color: 'var(--mx-surface-variant-on)',
                            }}
                          >
                            No {isSpace ? 'space' : 'room'}-level abbreviations defined yet.
                            {canEdit && ' Use the form above to add some.'}
                          </Text>
                        </SequenceCard>
                      ) : (
                        <>
                          {entries.map((entry, index) => (
                            <SequenceCard
                              key={entry.term}
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
                          ))}
                          {!isSpace &&
                            ancestorGroups.flatMap(({ spaceId, spaceName, entries: spEntries }) =>
                              spEntries.map((entry) => (
                                <SequenceCard
                                  key={`${spaceId}-${entry.term}`}
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
                                      <Chip variant="Primary" radii="Pill" size="400">
                                        <Text size="T200">Space - {spaceName}</Text>
                                      </Chip>
                                    </Box>
                                    <Text
                                      size="T200"
                                      style={{
                                        opacity: 0.7,
                                      }}
                                    >
                                      {entry.definition}
                                    </Text>
                                  </Box>
                                </SequenceCard>
                              ))
                            )}
                        </>
                      )}
                    </>
                  );
                })()}
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
