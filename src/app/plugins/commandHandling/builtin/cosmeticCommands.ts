import { StateEvent } from '$types/matrix/room';
import { sendFeedback } from '$utils/sendFeedbackToUser';
import { EventTimeline } from 'matrix-js-sdk';
import { parsePronounsInput } from '$utils/pronouns';
import { BuiltInCommand } from '../BuiltInCommand';
import { getCmdDescription } from '../BuiltInCommandsUtil';
import {
  CommandExecutionContext,
  GenericCommandExecutionArgContainer,
} from '../CommandExecutionContext';

export function cosmeticBuiltInCommands(): Array<BuiltInCommand> {
  const retArr = new Array<BuiltInCommand>();
  retArr.push(
    new BuiltInCommand(
      getCmdDescription('color'),
      async (
        context: CommandExecutionContext,
        args: Map<string, GenericCommandExecutionArgContainer>
      ) => {
        const color = args.get('color')?.val.trim().toLowerCase();
        const reset: boolean = args.get('reset')?.val ?? false;
        const userId = context.mx.getSafeUserId();

        try {
          if (reset) {
            await context.mx.sendStateEvent(
              context.room.roomId,
              StateEvent.RoomCosmeticsColor as any,
              {},
              userId
            );
            sendFeedback('Room color has been reset.', context.room, userId);
            return;
          }

          if (/^#[0-9A-F]{6}$/i.test(color)) {
            await context.mx.sendStateEvent(
              context.room.roomId,
              StateEvent.RoomCosmeticsColor as any,
              { color },
              userId
            );
            sendFeedback(`Room color set to ${color}.`, context.room, userId);
          } else {
            sendFeedback(
              `Invalid format (${color}). How did you mess that up?`,
              context.room,
              userId
            );
          }
        } catch (e: any) {
          if (e.errcode === 'M_FORBIDDEN') {
            sendFeedback(
              'Permission Denied. An admin must enable "Room Colors" in Settings > Cosmetics in app.sable.moe or another supported client.',
              context.room,
              userId
            );
          }
        }
      }
    ),
    new BuiltInCommand(
      getCmdDescription('scolor'),
      async (
        context: CommandExecutionContext,
        args: Map<string, GenericCommandExecutionArgContainer>
      ) => {
        const color = args.get('color')?.val.trim().toLowerCase();
        const reset: boolean = args.get('reset')?.val ?? false;
        const userId = context.mx.getSafeUserId();

        const parents = context.room
          .getLiveTimeline()
          .getState(EventTimeline.FORWARDS)
          ?.getStateEvents(StateEvent.SpaceParent);

        const targetSpaceId =
          parents && parents.length > 0 ? parents[0].getStateKey() : context.room.roomId;

        try {
          if (reset) {
            await context.mx.sendStateEvent(
              targetSpaceId as any,
              StateEvent.RoomCosmeticsColor as any,
              {},
              userId
            );
            sendFeedback('Global space color reset.', context.room, userId);
            return;
          }

          if (/^#[0-9A-F]{6}$/i.test(color)) {
            await context.mx.sendStateEvent(
              targetSpaceId as any,
              StateEvent.RoomCosmeticsColor as any,
              { color },
              userId
            );
            sendFeedback(`Global space color set to ${color}.`, context.room, userId);
          } else {
            sendFeedback(
              `Invalid format (${color}). How did you mess that up?`,
              context.room,
              userId
            );
          }
        } catch (e: any) {
          if (e.errcode === 'M_FORBIDDEN') {
            sendFeedback(
              'Permission Denied. An admin must enable "Space-Wide Colors" in Settings > Cosmetics in app.sable.moe or another supported client.',
              context.room,
              userId
            );
          }
        }
      }
    ),
    new BuiltInCommand(
      getCmdDescription('font'),
      async (
        context: CommandExecutionContext,
        args: Map<string, GenericCommandExecutionArgContainer>
      ) => {
        const font = args
          .get('font')
          ?.val.trim()
          .replaceAll(/[;{}<>]/g, '')
          .slice(0, 32);
        const userId = context.mx.getSafeUserId();

        try {
          if (args.get('reset')?.val) {
            await context.mx.sendStateEvent(
              context.room.roomId,
              StateEvent.RoomCosmeticsFont as any,
              {},
              userId
            );
            sendFeedback('Room font reset.', context.room, userId);
            return;
          }

          await context.mx.sendStateEvent(
            context.room.roomId,
            StateEvent.RoomCosmeticsFont as any,
            { font },
            userId
          );
          sendFeedback(`Room font set to "${font}".`, context.room, userId);
        } catch (e: any) {
          if (e.errcode === 'M_FORBIDDEN') {
            sendFeedback(
              'Permission Denied. An admin must enable "Room Fonts" in Settings > Cosmetics in app.sable.moe or another supported client.',
              context.room,
              userId
            );
          }
        }
      }
    ),
    new BuiltInCommand(
      getCmdDescription('sfont'),
      async (
        context: CommandExecutionContext,
        args: Map<string, GenericCommandExecutionArgContainer>
      ) => {
        const font = args
          .get('font')
          ?.val.trim()
          .replaceAll(/[;{}<>]/g, '')
          .slice(0, 32);
        const userId = context.mx.getSafeUserId();

        const parents = context.room
          .getLiveTimeline()
          .getState(EventTimeline.FORWARDS)
          ?.getStateEvents(StateEvent.SpaceParent);

        const targetSpaceId =
          parents && parents.length > 0 ? parents[0].getStateKey() : context.room.roomId;

        try {
          if (args.get('reset')?.val) {
            await context.mx.sendStateEvent(
              targetSpaceId as any,
              StateEvent.RoomCosmeticsFont as any,
              {},
              userId
            );
            sendFeedback('Space font reset.', context.room, userId);
            return;
          }

          await context.mx.sendStateEvent(
            targetSpaceId as any,
            StateEvent.RoomCosmeticsFont as any,
            { font },
            userId
          );
          sendFeedback(`Space font set to "${font}".`, context.room, userId);
        } catch (e: any) {
          if (e.errcode === 'M_FORBIDDEN') {
            sendFeedback(
              'Permission Denied. An admin must enable "Space-Wide Fonts" in Settings > Cosmetics in app.sable.moe or another supported client.',
              context.room,
              userId
            );
          }
        }
      }
    ),
    new BuiltInCommand(
      getCmdDescription('pronoun'),
      async (
        context: CommandExecutionContext,
        args: Map<string, GenericCommandExecutionArgContainer>
      ) => {
        const match = args
          .get('pronouns')
          ?.val.trim()
          .match(/^"(.*)"$/);
        const rawInput = match ? match[1].trim() : args.get('pronouns')?.val.trim();
        const userId = context.mx.getSafeUserId();

        try {
          if (args.get('reset')?.val) {
            await context.mx.sendStateEvent(
              context.room.roomId,
              StateEvent.RoomCosmeticsPronouns as any,
              {},
              userId
            );
            sendFeedback('Room pronouns have been reset.', context.room, userId);
            return;
          }

          const pronounsArray = parsePronounsInput(rawInput);

          await context.mx.sendStateEvent(
            context.room.roomId,
            StateEvent.RoomCosmeticsPronouns as any,
            { pronouns: pronounsArray },
            userId
          );

          const feedbackString = pronounsArray
            .map((p) => (p.language ? `for ${p.language} "${p.summary}" was set` : p.summary))
            .join(', ');

          sendFeedback(`Room pronouns set: ${feedbackString}`, context.room, userId);
        } catch (e: any) {
          if (e.errcode === 'M_FORBIDDEN') {
            sendFeedback(
              'Permission Denied. Could not update room pronouns.',
              context.room,
              userId
            );
          }
        }
      }
    ),
    new BuiltInCommand(
      getCmdDescription('spronoun'),
      async (
        context: CommandExecutionContext,
        args: Map<string, GenericCommandExecutionArgContainer>
      ) => {
        const match = args
          .get('pronouns')
          ?.val.trim()
          .match(/^"(.*)"$/);
        const rawInput = match ? match[1].trim() : args.get('pronouns')?.val.trim();
        const userId = context.mx.getSafeUserId();

        const parents = context.room
          .getLiveTimeline()
          .getState(EventTimeline.FORWARDS)
          ?.getStateEvents(StateEvent.SpaceParent);

        const targetSpaceId =
          parents && parents.length > 0 ? parents[0].getStateKey() : context.room.roomId;

        try {
          if (args.get('reset')?.val) {
            await context.mx.sendStateEvent(
              targetSpaceId as any,
              StateEvent.RoomCosmeticsPronouns as any,
              {},
              userId
            );
            sendFeedback('Global space pronouns reset.', context.room, userId);
            return;
          }

          const pronounsArray = parsePronounsInput(rawInput);

          await context.mx.sendStateEvent(
            targetSpaceId as any,
            StateEvent.RoomCosmeticsPronouns as any,
            { pronouns: pronounsArray },
            userId
          );

          const feedbackString = pronounsArray
            .map((p) => (p.language ? `for ${p.language} "${p.summary}" was set` : p.summary))
            .join(', ');

          sendFeedback(`Global space pronouns set: ${feedbackString}`, context.room, userId);
        } catch (e: any) {
          if (e.errcode === 'M_FORBIDDEN') {
            sendFeedback(
              'Permission Denied. Could not update space pronouns.',
              context.room,
              userId
            );
          }
        }
      }
    )
  );
  return retArr;
}
