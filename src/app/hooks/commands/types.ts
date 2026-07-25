import type { MatrixClient, Room } from '$types/matrix-sdk';
import type { PKitCommandMessageHandler } from '$plugins/pluralkit-handler/PKitCommandMessageHandler';
import type { useRoomNavigate } from '../useRoomNavigate';

export type CommandExe = (payload: string, html?: string) => Promise<void>;

export enum Command {
  // Cinny commands
  Me = 'me',
  Notice = 'notice',
  Shrug = 'shrug',
  StartDm = 'startdm',
  Join = 'join',
  Leave = 'leave',
  Invite = 'invite',
  DisInvite = 'disinvite',
  Kick = 'kick',
  Ban = 'ban',
  UnBan = 'unban',
  Ignore = 'ignore',
  UnIgnore = 'unignore',
  MyRoomNick = 'myroomnick',
  MyRoomAvatar = 'myroomavatar',
  ConvertToDm = 'converttodm',
  ConvertToRoom = 'converttoroom',
  TableFlip = 'tableflip',
  UnFlip = 'unflip',
  Delete = 'delete',
  Acl = 'acl',
  // Sable commands
  Knock = 'knock',
  Color = 'color',
  SColor = 'scolor',
  Font = 'font',
  SFont = 'sfont',
  AddWidget = 'addwidget',
  AddPerMessageProfileToAccount = 'addpmp',
  DeletePerMessageProfileFromAccount = 'delpmp',
  UsePerMessageProfile = 'usepmp',
  AssociateProxyPerMessageProfile = 'pmpproxy',
  Pronoun = 'pronoun',
  SPronoun = 'spronoun',
  Rainbow = 'rainbow',
  RainbowMe = 'rainbowme',
  RawMsg = 'rawmsg',
  Raw = 'raw',
  RawAcc = 'rawacc',
  DelAcc = 'delacc',
  SetExt = 'setext',
  DelExt = 'delext',
  DiscardSession = 'discardsession',
  Html = 'html',
  // Cute Events
  Hug = 'hug',
  Cuddle = 'cuddle',
  // our own cute events, not part of FluffyChat or other clients
  Wave = 'wave',
  Poke = 'poke',
  Headpat = 'headpat',
  // Meta
  Report = 'bugreport',
  // Experimental
  ShareE2EEHistory = 'sharehistory',
  // Spec missing from cinny
  Location = 'location',
  ShareMyLocation = 'sharemylocation',
  Poll = 'poll',
}

export type CommandContent = {
  name: string;
  description: string;
  exe: CommandExe;
};

export type CommandRecord = Record<Command, CommandContent>;

export type CommandContext = {
  mx: MatrixClient;
  room: Room;
  navigateRoom: ReturnType<typeof useRoomNavigate>['navigateRoom'];
  profileDisplayName: string | undefined;
  pkitcmdHandler: PKitCommandMessageHandler;
  developerTools: boolean;
  enableMSC4268CMD: boolean;
  openBugReport: () => void;
};
