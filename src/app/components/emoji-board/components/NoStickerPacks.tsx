import {Box, config, Text, toRem} from 'folds';
import {dropzoneIcon, Sticker} from '$components/icons/phosphor';
import {useOpenRoomSettings} from "$state/hooks/roomSettings.ts";
import {useOpenSpaceSettings} from "$state/hooks/spaceSettings.ts";
import {useRoomOptionally} from "$hooks/useRoom.ts";
import {useSpaceOptionally} from "$hooks/useSpace.ts";
import * as css from './styles.css';
import {RoomSettingsPage} from "$state/roomSettings.ts";
import {SpaceSettingsPage} from "$state/spaceSettings.ts";

function OptionallyLinkedText(props: { text: string, isLink: boolean, onClick: () => void }) {
    return props.isLink ? (
        <Text as="span" className={css.TextLink} onClick={props.onClick} size="Inherit">{props.text}</Text>
    ) : (
        <>{props.text}</>
    );
}

export function NoStickerPacks() {
    const openRoomSettings = useOpenRoomSettings();
    const openSpaceSettings = useOpenSpaceSettings();

    const room = useRoomOptionally();
    const space = useSpaceOptionally();

    return (
        <Box
            style={{padding: `${toRem(60)} ${config.space.S500}`}}
            alignItems="Center"
            justifyContent="Center"
            direction="Column"
            gap="300"
        >
            {dropzoneIcon(Sticker)}
            <Box direction="Inherit">
                <Text align="Center">No Sticker Packs!</Text>
                <Text priority="300" align="Center" size="T200">
                    Add stickers from user,{' '}
                    <OptionallyLinkedText text="room" isLink={room !== null}
                                          onClick={() => openRoomSettings(room?.roomId as string, space?.roomId, RoomSettingsPage.EmojisStickersPage)}/>
                    {', '}or{' '}
                    <OptionallyLinkedText text="space" isLink={room !== null && space !== null}
                                          onClick={() => openSpaceSettings(room?.roomId as string, space?.roomId, SpaceSettingsPage.EmojisStickersPage)}/>
                    {' '}settings.
                </Text>
            </Box>
        </Box>
    );
}
