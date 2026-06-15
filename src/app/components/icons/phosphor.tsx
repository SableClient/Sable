import type { IconProps } from '@phosphor-icons/react';
import {
  ArrowsDownUpIcon,
  ArrowBendUpRightIcon,
  ArrowBendUpLeftIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowsLeftRightIcon,
  ArrowRightIcon,
  ArrowSquareOutIcon,
  ArrowUpIcon,
  ArrowsClockwiseIcon,
  AtIcon,
  BasketballIcon,
  BellIcon,
  BellRingingIcon,
  BellSlashIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpIcon,
  ChatCircleIcon,
  ChatCircleDotsIcon,
  ChatsIcon,
  ChatTeardropDotsIcon,
  CheckIcon,
  ChecksIcon,
  ClockIcon,
  ClockCounterClockwiseIcon,
  CodeIcon,
  CodeBlockIcon,
  CoffeeIcon,
  CompassIcon,
  DatabaseIcon,
  DevicesIcon,
  DotsThreeIcon,
  DotsThreeOutlineVerticalIcon,
  DownloadIcon,
  EnvelopeSimpleIcon,
  EyeIcon,
  EyeSlashIcon,
  FileIcon,
  FlagIcon,
  FlaskIcon,
  FlowerIcon,
  FunnelIcon,
  GearSixIcon,
  GlobeIcon,
  GridFourIcon,
  HardDrivesIcon,
  HashIcon,
  HashStraightIcon,
  HeadphonesIcon,
  HeartIcon,
  HouseIcon,
  ImageIcon,
  InfoIcon,
  KeyboardIcon,
  LeafIcon,
  LightbulbIcon,
  LinkIcon,
  ListBulletsIcon,
  ListNumbersIcon,
  LockIcon,
  MagnifyingGlassIcon,
  MapPinPlusIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
  MinusIcon,
  MonitorIcon,
  MonitorArrowUpIcon,
  PaintBrushIcon,
  PaletteIcon,
  PaperPlaneTiltIcon,
  PauseIcon,
  PawPrintIcon,
  PeaceIcon,
  PencilSimpleIcon,
  PhoneIcon,
  PhoneDisconnectIcon,
  PlayIcon,
  PlusIcon,
  PlusCircleIcon,
  PresentationIcon,
  ProhibitIcon,
  PushPinIcon,
  PushPinSlashIcon,
  RecycleIcon,
  QuotesIcon,
  ShareNetworkIcon,
  ShieldIcon,
  ShieldWarningIcon,
  SignInIcon,
  SignOutIcon,
  SmileyIcon,
  SmileyStickerIcon,
  SortAscendingIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  SquaresFourIcon,
  StarIcon,
  StickerIcon,
  StopIcon,
  SunIcon,
  TerminalIcon,
  TextAaIcon,
  TextBIcon,
  TextHOneIcon,
  TextHThreeIcon,
  TextHTwoIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextUnderlineIcon,
  TrashIcon,
  TrayIcon,
  TreeStructureIcon,
  UserIcon,
  UserCircleIcon,
  UserMinusIcon,
  UserPlusIcon,
  UsersThreeIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
  WarningIcon,
  XIcon,
} from '@phosphor-icons/react';
import type { ComponentType, ReactNode } from 'react';
import { useLayoutEffect } from 'react';
import { useSetting } from '$state/hooks/settings';
import { getSettings, settingsAtom } from '$state/settings';

export const DEFAULT_PHOSPHOR_SIZES = {
  compact: 16,
  inline: 20,
  toolbar: 24,
  empty: 32,
} as const;

export type PhosphorRoleSizes = {
  compact: number;
  inline: number;
  toolbar: number;
  empty: number;
};

let runtimePhosphorSizes: PhosphorRoleSizes | null = null;

export function getPhosphorSize(): PhosphorRoleSizes {
  if (runtimePhosphorSizes) return runtimePhosphorSizes;
  const settings = getSettings();
  return {
    compact: settings.iconCompactSizePx,
    inline: settings.iconInlineSizePx,
    toolbar: settings.iconToolbarSizePx,
    empty: settings.iconEmptySizePx,
  };
}

export function IconSizesProvider({ children }: { children: ReactNode }) {
  const [compact] = useSetting(settingsAtom, 'iconCompactSizePx');
  const [inline] = useSetting(settingsAtom, 'iconInlineSizePx');
  const [toolbar] = useSetting(settingsAtom, 'iconToolbarSizePx');
  const [empty] = useSetting(settingsAtom, 'iconEmptySizePx');

  runtimePhosphorSizes = { compact, inline, toolbar, empty };

  useLayoutEffect(
    () => () => {
      runtimePhosphorSizes = null;
    },
    []
  );

  return children;
}

export type IconSizeToken = '50' | '100' | '200' | '300' | '400' | '500' | '600' | 'Inherit';

function resolveIconTokenPx(
  token: Exclude<IconSizeToken, 'Inherit'>,
  sizes: PhosphorRoleSizes
): number {
  switch (token) {
    case '50':
      return Math.round((sizes.compact * 12) / DEFAULT_PHOSPHOR_SIZES.compact);
    case '100':
      return sizes.compact;
    case '200':
      return sizes.inline;
    case '300':
      return sizes.toolbar;
    case '400':
      return Math.round((sizes.toolbar + sizes.empty) / 2);
    case '500':
      return sizes.empty;
    case '600':
      return Math.round((sizes.empty * 48) / DEFAULT_PHOSPHOR_SIZES.empty);
    default:
      return sizes.inline;
  }
}

const timelineMutedStyle = { opacity: 0.6 } as const;

export type PhosphorIcon = ComponentType<IconProps>;

type SizedIconProps = IconProps & {
  filled?: boolean;
};

export function sizedIcon(
  Icon: PhosphorIcon,
  size: IconSizeToken = '200',
  props?: SizedIconProps
): ReactNode {
  const { filled, weight, style, ...rest } = props ?? {};
  const resolvedWeight = weight ?? (filled ? 'fill' : 'regular');
  if (size === 'Inherit') {
    return <Icon size="1em" weight={resolvedWeight} style={style} {...rest} />;
  }
  return (
    <Icon
      size={resolveIconTokenPx(size, getPhosphorSize())}
      weight={resolvedWeight}
      style={style}
      {...rest}
    />
  );
}

export function timelineIcon(Icon: PhosphorIcon, props?: IconProps): ReactNode {
  return <Icon size={getPhosphorSize().inline} style={timelineMutedStyle} {...props} />;
}

export function menuIcon(Icon: PhosphorIcon, props?: IconProps): ReactNode {
  return <Icon size={getPhosphorSize().inline} {...props} />;
}

export function composerIcon(Icon: PhosphorIcon, props?: IconProps): ReactNode {
  return <Icon size={getPhosphorSize().toolbar} {...props} />;
}

export function chipIcon(Icon: PhosphorIcon, props?: IconProps): ReactNode {
  return <Icon size={getPhosphorSize().inline} {...props} />;
}

export function profileIcon(Icon: PhosphorIcon, props?: SizedIconProps): ReactNode {
  return sizedIcon(Icon, '100', props);
}

export function chipCaretIcon(Icon: PhosphorIcon, props?: IconProps): ReactNode {
  const { style, ...rest } = props ?? {};
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0,
        flexShrink: 0,
      }}
    >
      <Icon size={getPhosphorSize().inline} style={{ display: 'block', ...style }} {...rest} />
    </span>
  );
}

export function dropzoneIcon(Icon: PhosphorIcon, props?: IconProps): ReactNode {
  return <Icon size={getPhosphorSize().empty} {...props} />;
}

export function settingsNavIcon(Icon: PhosphorIcon, active: boolean, props?: IconProps): ReactNode {
  return <Icon size={getPhosphorSize().inline} weight={active ? 'fill' : 'regular'} {...props} />;
}

export type UserFallbackSize = 'sm' | 'md' | 'lg' | 'xl' | 'hero';

export function userFallbackIcon(size: UserFallbackSize = 'md', props?: IconProps): ReactNode {
  const sizes = getPhosphorSize();
  const px = {
    sm: sizes.inline,
    md: sizes.inline,
    lg: sizes.toolbar,
    xl: sizes.toolbar,
    hero: sizes.empty,
  }[size];
  return <UserIcon size={px} weight="regular" {...props} />;
}

export {
  ArrowsDownUpIcon as ArrowsDownUp,
  ArrowBendUpRightIcon,
  ArrowBendUpLeftIcon,
  ArrowDownIcon as ArrowDown,
  ArrowLeftIcon as ArrowLeft,
  ArrowsLeftRightIcon as ArrowsLeftRight,
  ArrowRightIcon as ArrowRight,
  ArrowSquareOutIcon as ArrowSquareOut,
  ArrowUpIcon as ArrowUp,
  ArrowsClockwiseIcon as ArrowsClockwise,
  AtIcon as At,
  BasketballIcon as Basketball,
  BellIcon as Bell,
  BellRingingIcon as BellRinging,
  BellSlashIcon as BellSlash,
  CaretDownIcon as CaretDown,
  CaretLeftIcon as CaretLeft,
  CaretRightIcon as CaretRight,
  CaretUpIcon as CaretUp,
  ChatCircleIcon as ChatCircle,
  ChatCircleDotsIcon as ChatCircleDots,
  ChatsIcon as Chats,
  ChatTeardropDotsIcon as ChatTeardropDots,
  CheckIcon as Check,
  ChecksIcon as Checks,
  ClockIcon as Clock,
  ClockCounterClockwiseIcon as ClockCounterClockwise,
  CodeIcon as Code,
  CodeBlockIcon as CodeBlock,
  CoffeeIcon as Coffee,
  CompassIcon as Compass,
  DatabaseIcon as Database,
  DevicesIcon as Devices,
  DotsThreeIcon as DotsThree,
  DotsThreeOutlineVerticalIcon,
  DownloadIcon as Download,
  EnvelopeSimpleIcon as EnvelopeSimple,
  EyeIcon as Eye,
  EyeSlashIcon as EyeSlash,
  FileIcon as File,
  FlagIcon as Flag,
  FlaskIcon as Flask,
  FlowerIcon as Flower,
  FunnelIcon as Funnel,
  GearSixIcon as GearSix,
  GlobeIcon as Globe,
  GridFourIcon as GridFour,
  HardDrivesIcon as HardDrives,
  HashIcon as Hash,
  HashStraightIcon as HashStraight,
  HeadphonesIcon as Headphones,
  HeartIcon as Heart,
  HouseIcon as House,
  ImageIcon as Image,
  InfoIcon as Info,
  KeyboardIcon as Keyboard,
  LeafIcon as Leaf,
  LightbulbIcon as Lightbulb,
  LinkIcon as Link,
  ListBulletsIcon as ListBullets,
  ListNumbersIcon as ListNumbers,
  LockIcon as Lock,
  MagnifyingGlassIcon as MagnifyingGlass,
  MapPinPlusIcon,
  MicrophoneIcon as Microphone,
  MicrophoneSlashIcon as MicrophoneSlash,
  MinusIcon as Minus,
  MonitorIcon as Monitor,
  MonitorArrowUpIcon as ScreenShare,
  PaintBrushIcon as PaintBrush,
  PaletteIcon as Palette,
  PaperPlaneTiltIcon as PaperPlaneTilt,
  PauseIcon as Pause,
  PawPrintIcon as PawPrint,
  PeaceIcon as Peace,
  PencilSimpleIcon as PencilSimple,
  PhoneIcon as Phone,
  PhoneDisconnectIcon as PhoneDisconnect,
  PlayIcon as Play,
  PlusIcon as Plus,
  PlusCircleIcon as PlusCircle,
  PresentationIcon as Presentation,
  ProhibitIcon as Prohibit,
  PushPinIcon as PushPin,
  PushPinSlashIcon as PushPinSlash,
  RecycleIcon as Recycle,
  QuotesIcon as Quotes,
  ShareNetworkIcon as ShareNetwork,
  ShieldIcon as Shield,
  ShieldWarningIcon as ShieldWarning,
  SignInIcon as SignIn,
  SignOutIcon as SignOut,
  SmileyIcon as Smiley,
  SmileyStickerIcon as SmileySticker,
  SortAscendingIcon as SortAscending,
  SpeakerHighIcon as SpeakerHigh,
  SpeakerSlashIcon as SpeakerSlash,
  SquaresFourIcon as SquaresFour,
  StarIcon as Star,
  StickerIcon as Sticker,
  StopIcon as Stop,
  SunIcon as Sun,
  TerminalIcon as Terminal,
  TextAaIcon as TextAa,
  TextBIcon as TextB,
  TextHOneIcon as TextHOne,
  TextHThreeIcon as TextHThree,
  TextHTwoIcon as TextHTwo,
  TextItalicIcon as TextItalic,
  TextStrikethroughIcon as TextStrikethrough,
  TextUnderlineIcon as TextUnderline,
  TrashIcon as Trash,
  TrayIcon as Tray,
  TreeStructureIcon as TreeStructure,
  UserIcon as User,
  UserCircleIcon as UserCircle,
  UserMinusIcon as UserMinus,
  UserPlusIcon as UserPlus,
  UsersThreeIcon as UsersThree,
  VideoCameraIcon as VideoCamera,
  VideoCameraSlashIcon as VideoCameraSlash,
  WarningIcon as Warning,
  XIcon as X,
};
