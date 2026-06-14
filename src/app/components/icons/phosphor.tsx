import type { IconProps } from '@phosphor-icons/react';
import {
  ArrowsDownUpIcon,
  ArrowBendUpRightIcon,
  ArrowBendUpLeftIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
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

/** Inline (20px), toolbar (24px), and empty-state (40px) icon sizes. */
export const PHOSPHOR_SIZE = {
  inline: 20,
  toolbar: 24,
  empty: 40,
} as const;

/** Icon size tokens for `sizedIcon()` mapped to pixel values. */
export type IconSizeToken = '50' | '100' | '200' | '300' | '400' | '500' | '600' | 'Inherit';

const ICON_SIZE_PX: Record<Exclude<IconSizeToken, 'Inherit'>, number> = {
  '50': 12,
  '100': 16,
  '200': 20,
  '300': 24,
  '400': 32,
  '500': 40,
  '600': 48,
};

const timelineMutedStyle = { opacity: 0.6 } as const;

export type PhosphorIcon = ComponentType<IconProps>;

type SizedIconProps = IconProps & {
  /** Folds `Icon` `filled` prop — maps to Phosphor `fill` weight. */
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
  return <Icon size={ICON_SIZE_PX[size]} weight={resolvedWeight} style={style} {...rest} />;
}

export function timelineIcon(Icon: PhosphorIcon, props?: IconProps): ReactNode {
  return <Icon size={PHOSPHOR_SIZE.inline} style={timelineMutedStyle} {...props} />;
}

export function menuIcon(Icon: PhosphorIcon, props?: IconProps): ReactNode {
  return <Icon size={PHOSPHOR_SIZE.inline} {...props} />;
}

export function composerIcon(Icon: PhosphorIcon, props?: IconProps): ReactNode {
  return <Icon size={PHOSPHOR_SIZE.toolbar} {...props} />;
}

export function chipIcon(Icon: PhosphorIcon, props?: IconProps): ReactNode {
  return <Icon size={PHOSPHOR_SIZE.inline} {...props} />;
}

export function profileIcon(Icon: PhosphorIcon, props?: SizedIconProps): ReactNode {
  return sizedIcon(Icon, '100', props);
}

/** Caret in chip `after` slots — flex-centered so Phosphor glyphs align with label text. */
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
      <Icon size={PHOSPHOR_SIZE.inline} style={{ display: 'block', ...style }} {...rest} />
    </span>
  );
}

/** @deprecated Prefer composerIcon — same toolbar size. */
export function navIcon(Icon: PhosphorIcon, props?: IconProps): ReactNode {
  return composerIcon(Icon, props);
}

export function dropzoneIcon(Icon: PhosphorIcon, props?: IconProps): ReactNode {
  return <Icon size={PHOSPHOR_SIZE.empty} {...props} />;
}

export function settingsNavIcon(Icon: PhosphorIcon, active: boolean, props?: IconProps): ReactNode {
  return <Icon size={PHOSPHOR_SIZE.inline} weight={active ? 'fill' : 'regular'} {...props} />;
}

export type UserFallbackSize = 'sm' | 'md' | 'lg' | 'xl' | 'hero';

const USER_FALLBACK_SIZE = {
  sm: PHOSPHOR_SIZE.inline,
  md: PHOSPHOR_SIZE.inline,
  lg: PHOSPHOR_SIZE.toolbar,
  xl: PHOSPHOR_SIZE.toolbar,
  hero: PHOSPHOR_SIZE.empty,
} as const;

export function userFallbackIcon(size: UserFallbackSize = 'md', props?: IconProps): ReactNode {
  return <UserIcon size={USER_FALLBACK_SIZE[size]} weight="regular" {...props} />;
}

export {
  ArrowsDownUpIcon as ArrowsDownUp,
  ArrowBendUpRightIcon,
  ArrowBendUpLeftIcon,
  ArrowDownIcon as ArrowDown,
  ArrowLeftIcon as ArrowLeft,
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
