import { useOpenBugReportModal } from '$state/hooks/bugReportModal';
import { MsgType } from 'matrix-js-sdk';
import { sendFeedback } from '$utils/sendFeedbackToUser';
import { BuiltInCommand } from '../BuiltInCommand';
import { getCmdDescription } from '../BuiltInCommandsUtil';
import {
  CommandExecutionContext,
  GenericCommandExecutionArgContainer,
} from '../CommandExecutionContext';

export function miscBuiltInCommands(): Array<BuiltInCommand> {
  const retArr = new Array<BuiltInCommand>();
  retArr.push(
    new BuiltInCommand(
      getCmdDescription('bugreport'),
      async (
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: CommandExecutionContext,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _args: Map<string, GenericCommandExecutionArgContainer>
      ) => {
        useOpenBugReportModal();
      }
    ),
    new BuiltInCommand(
      getCmdDescription('html'),
      async (
        context: CommandExecutionContext,
        args: Map<string, GenericCommandExecutionArgContainer>
      ) => {
        await context.mx.sendMessage(context.room.roomId, {
          msgtype: MsgType.Text,
          body: args
            .get('msg')
            ?.val.replaceAll('<br>', '\n')
            .replaceAll('<li>', '\n- ')
            .replaceAll(
              /<a(.*?)href="(?<link>(.*?))"(.*?)>(?<text>(.*?))<\/a>/g,
              '[$<text>]($<link>)'
            )
            .replaceAll(/<[^>]*>/g, ''),
          format: 'org.matrix.custom.html',
          formatted_body: args.get('msg')?.val,
        });
      }
    ),
    new BuiltInCommand(
      getCmdDescription('sharemylocation'),
      async (
        context: CommandExecutionContext,
        args: Map<string, GenericCommandExecutionArgContainer>
      ) => {
        const options = {
          enableHighAccuracy: args.get('accurate')?.val ?? false,
          timeout: 5000,
          maximumAge: 0,
        };
        function success(pos: any) {
          const crd = pos.coords;

          const mlat = crd.latitude;
          const mlon = crd.longitude;
          const malt = crd.altitude;
          const macc = crd.accuracy;
          if (!mlat || !mlat) {
            sendFeedback(
              'Unable to retrieve the location data for an unknown reason',
              context.room,
              context.mx.getSafeUserId()
            );
            return;
          }
          context.mx.sendMessage(context.room.roomId, {
            msgtype: MsgType.Location,
            geo_uri: `geo:${mlat},${mlon}${malt ? `,${malt}` : ''};u=${macc}`,
            body: `https://www.openstreetmap.org/?mlat=${mlat}&mlon=${mlon}#map=16/${mlat}/${mlon}"`,
          } as any);
        }

        function error(err: any) {
          let response = `Unable to retrieve the location data, Error no. ${err.code}: ${err.message}`;
          if (err.code === 1) response = 'You have denied Sable access to you location services.';
          if (err.code === 2)
            response = 'Your device does not have a gps module, or it may not be turned on.';
          sendFeedback(response, context.room, context.mx.getSafeUserId());
        }
        navigator.geolocation.getCurrentPosition(success, error, options);
      }
    ),
    new BuiltInCommand(
      getCmdDescription('location'),
      async (
        context: CommandExecutionContext,
        args: Map<string, GenericCommandExecutionArgContainer>
      ) => {
        const mlat = args.get('latitude')?.val;
        const mlon = args.get('longitude')?.val;
        const malt = args.get('altitude')?.val;
        if (!mlat || !mlon) {
          sendFeedback(
            'You need to specify a latitude, a longitude parameter, and optionally an altitude, as for example: /location 43.959971 -59.790623 or use the /sharemylocation to share the current location',
            context.room,
            context.mx.getSafeUserId()
          );
          return;
        }
        await context.mx.sendMessage(context.room.roomId, {
          msgtype: MsgType.Location,
          geo_uri: `geo:${mlat},${mlon}${malt ? `,${malt}` : ''};u=0`,
          body: `https://www.openstreetmap.org/?mlat=${mlat}&mlon=${mlon}#map=16/${mlat}/${mlon}"`,
        } as any);
      }
    )
  );
  return retArr;
}
