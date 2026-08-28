import type { RoomMessageEventContent } from '$types/matrix-sdk';
import { MatrixError, MsgType } from '$types/matrix-sdk';
import { sendFeedback } from '$utils/sendFeedbackToUser';
import { CustomStateEvent } from '$types/matrix/room';
import { ErrorCode } from '../../cs-errorcode';
import { enrichWidgetUrl } from '../useRoomWidgets';
import type { LocationPoint } from '$features/room/location-modal/LocationDialog';
import { filterLocationString, LocationErrors } from '$features/room/location-modal/LocationDialog';
import type { CommandContext, CommandRecord } from './types';
import { Command } from './types';

export const createMiscCommands = (ctx: CommandContext): Partial<CommandRecord> => {
  const { mx, room, enableMSC4268CMD, openBugReport } = ctx;
  return {
    [Command.AddWidget]: {
      name: Command.AddWidget,
      description: 'Add a widget to this room. Usage: /addwidget <url> [name]',
      exe: async (payload) => {
        const userId = mx.getSafeUserId();

        const parts = payload.trim().split(/\s+/);
        const url = parts[0];
        const name = parts.slice(1).join(' ') || 'Widget';

        if (!url) {
          sendFeedback('Usage: /addwidget <url> [name]', room, userId);
          return;
        }

        let parsedUrl: URL;
        try {
          parsedUrl = new URL(url);
        } catch {
          sendFeedback('Invalid URL. Please provide a valid widget URL.', room, userId);
          return;
        }

        try {
          const widgetId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          await mx.sendStateEvent(
            room.roomId,
            CustomStateEvent.RoomWidget,
            {
              type: 'm.custom',
              url: enrichWidgetUrl(parsedUrl.toString()),
              name,
              id: widgetId,
              creatorUserId: userId,
            },
            widgetId
          );
          sendFeedback(`Widget "${name}" added.`, room, userId);
        } catch (e: unknown) {
          if (e instanceof MatrixError && e.errcode === ErrorCode.M_FORBIDDEN) {
            sendFeedback(
              'Permission denied. You need permission to manage widgets in this room.',
              room,
              userId
            );
          } else {
            sendFeedback(
              `Failed to add widget: ${(e as Error).message || 'Unknown error'}`,
              room,
              userId
            );
          }
        }
      },
    },
    [Command.Report]: {
      name: Command.Report,
      description: 'Report a bug or request a feature',
      exe: async () => {
        openBugReport();
      },
    },
    [Command.ShareE2EEHistory]: {
      name: Command.ShareE2EEHistory,
      description:
        'Share E2EE history (MSC4268) of this room with a user. Example: /sharee2eehistory @user:example.org',
      exe: async (payload) => {
        const targetUserId = payload.trim();
        const { roomId } = room;
        if (!enableMSC4268CMD) {
          sendFeedback(
            'This command is disabled. Enable it under experimental settings to use it.',
            room,
            mx.getSafeUserId()
          );
          return;
        }
        if (!targetUserId) {
          sendFeedback('Usage: /sharee2eehistory @user:example.org', room, mx.getSafeUserId());
          return;
        }
        const crypto = mx.getCrypto();
        if (!crypto) {
          sendFeedback('Encryption is not enabled on this client.', room, mx.getSafeUserId());
          return;
        }
        (
          crypto as unknown as {
            shareRoomHistoryWithUser: (roomId: string, userId: string) => Promise<void>;
          }
        )
          .shareRoomHistoryWithUser(roomId, targetUserId)
          .then(() => {
            sendFeedback(
              `E2EE history shared with ${targetUserId}. (Their client needs to support MSC4268)`,
              room,
              mx.getSafeUserId()
            );
          })
          .catch((e: Error) => {
            sendFeedback(
              `Failed to share E2EE history: ${(e as Error).message}`,
              room,
              mx.getSafeUserId()
            );
          });
      },
    },
    [Command.Location]: {
      name: Command.Location,
      description:
        'Open location sharing menu or share a location as /location <latitude> <longitude>',
      exe: async (payload) => {
        const coords: LocationPoint = filterLocationString(payload);
        if (!coords.lat || !coords.lon || coords.status !== LocationErrors.none) {
          sendFeedback(
            'You need to specify a latitude, and a longitude parameter, as for example: /location 43.959971 -59.790623 or have nothing after the /location to open the map to click which location to share',
            room,
            mx.getSafeUserId()
          );
          return;
        }

        const mlat = coords.lat;
        const mlon = coords.lon;

        if (mlat && mlon)
          await mx.sendMessage(room.roomId, {
            msgtype: MsgType.Location,
            geo_uri: `geo:${mlat},${mlon};u=0`,
            body: `https://www.openstreetmap.org/?mlat=${mlat}&mlon=${mlon}#map=16/${mlat}/${mlon}"`,
          } as RoomMessageEventContent);
      },
    },
    [Command.ShareMyLocation]: {
      name: Command.ShareMyLocation,
      description:
        'Share current location. Requires your browser to have location permissions. Add the flag --accurate or -a for enabling the high accuracy option',
      exe: async (payload) => {
        const target = payload.trim();
        const options = {
          enableHighAccuracy:
            target === '--accurate' ||
            target === '-a' ||
            target === '--high-accuracy' ||
            target === '-h',
          timeout: 5000,
          maximumAge: 0,
        };
        function success(pos: GeolocationPosition) {
          const crd = pos.coords;

          const mlat = crd.latitude;
          const mlon = crd.longitude;
          const malt = crd.altitude;
          if (!mlat || !mlon) {
            sendFeedback(
              'Unable to retrieve the location data for an unknown reason',
              room,
              mx.getSafeUserId()
            );
            return;
          }
          mx.sendMessage(room.roomId, {
            msgtype: MsgType.Location,
            geo_uri: `geo:${mlat},${mlon}${malt ? `,${malt}` : ''};u=0`,
            body: `https://www.openstreetmap.org/?mlat=${mlat}&mlon=${mlon}#map=16/${mlat}/${mlon}"`,
          } as unknown as RoomMessageEventContent);
        }

        function error(err: GeolocationPositionError) {
          let response = `Unable to retrieve the location data, Error no. ${err.code}: ${err.message}`;
          if (err.code === 1) response = 'You have denied Sable access to you location services.';
          if (err.code === 2)
            response = 'Your device does not have a gps module, or it may not be turned on.';
          sendFeedback(response, room, mx.getSafeUserId());
        }
        navigator.geolocation.getCurrentPosition(success, error, options);
      },
    },
    [Command.Poll]: {
      name: Command.Poll,
      description: 'Create a poll',
      exe: async () => {
        return;
      },
    },
  };
};
