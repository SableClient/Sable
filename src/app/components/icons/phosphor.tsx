import type { IconProps } from '@phosphor-icons/react';
import {
  ArrowsDownUp,
  ArrowBendUpRightIcon,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  ArrowUp,
  ArrowsClockwise,
  At,
  Basketball,
  Bell,
  BellRinging,
  BellSlash,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  ChatCircle,
  ChatCircleDots,
  Chats,
  ChatTeardropDots,
  Check,
  Checks,
  Clock,
  ClockCounterClockwise,
  Code,
  CodeBlock,
  Coffee,
  Compass,
  Database,
  Devices,
  DotsThree,
  DotsThreeOutlineVerticalIcon,
  Download,
  EnvelopeSimple,
  Eye,
  EyeSlash,
  File,
  Flag,
  Flask,
  Flower,
  Funnel,
  GearSix,
  Globe,
  GridFour,
  HardDrives,
  Hash,
  HashStraight,
  Headphones,
  Heart,
  House,
  Image,
  Info,
  Keyboard,
  Leaf,
  Lightbulb,
  Link,
  ListBullets,
  ListNumbers,
  Lock,
  MagnifyingGlass,
  MapPinPlusIcon,
  Microphone,
  MicrophoneSlash,
  Minus,
  Monitor,
  PaintBrush,
  Palette,
  PaperPlaneTilt,
  Pause,
  PawPrint,
  Peace,
  PencilSimple,
  Phone,
  PhoneDisconnect,
  Play,
  Plus,
  PlusCircle,
  Presentation,
  Prohibit,
  PushPin,
  PushPinSlash,
  Quotes,
  ShareNetwork,
  Shield,
  ShieldWarning,
  SignIn,
  SignOut,
  Smiley,
  SmileySticker,
  SortAscending,
  SpeakerHigh,
  SpeakerSlash,
  SquaresFour,
  Star,
  Sticker,
  Stop,
  Sun,
  Terminal,
  TextAa,
  TextB,
  TextHOne,
  TextHThree,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
  TextUnderline,
  Trash,
  Tray,
  TreeStructure,
  User,
  UserCircle,
  UserMinus,
  UserPlus,
  UsersThree,
  VideoCamera,
  VideoCameraSlash,
  Warning,
  X,
} from '@phosphor-icons/react';
import type { ComponentType, ReactNode } from 'react';

/** Inline (20px), toolbar (24px), and empty-state (40px) icon sizes. */
export const PHOSPHOR_SIZE = {
  inline: 20,
  toolbar: 24,
  empty: 40,
} as const;

/** Icon size tokens for `iconAt()` mapped to pixel values. */
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

type IconAtProps = IconProps & {
  /** Folds `Icon` `filled` prop — maps to Phosphor `fill` weight. */
  filled?: boolean;
};

export function iconAt(
  Icon: PhosphorIcon,
  size: IconSizeToken = '200',
  props?: IconAtProps
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

export function profileIcon(Icon: PhosphorIcon, props?: IconAtProps): ReactNode {
  return iconAt(Icon, '100', props);
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
  return <User size={USER_FALLBACK_SIZE[size]} weight="regular" {...props} />;
}

export {
  ArrowsDownUp,
  ArrowBendUpRightIcon,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  ArrowUp,
  ArrowsClockwise,
  At,
  Basketball,
  Bell,
  BellRinging,
  BellSlash,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  ChatCircle,
  ChatCircleDots,
  Chats,
  ChatTeardropDots,
  Check,
  Checks,
  Clock,
  ClockCounterClockwise,
  Code,
  CodeBlock,
  Coffee,
  Compass,
  Database,
  Devices,
  DotsThree,
  DotsThreeOutlineVerticalIcon,
  Download,
  EnvelopeSimple,
  Eye,
  EyeSlash,
  File,
  Flag,
  Flask,
  Flower,
  Funnel,
  GearSix,
  Globe,
  GridFour,
  HardDrives,
  Hash,
  HashStraight,
  Headphones,
  Heart,
  House,
  Image,
  Info,
  Keyboard,
  Leaf,
  Lightbulb,
  Link,
  ListBullets,
  ListNumbers,
  Lock,
  MagnifyingGlass,
  MapPinPlusIcon,
  Microphone,
  MicrophoneSlash,
  Minus,
  Monitor,
  PaintBrush,
  Palette,
  PaperPlaneTilt,
  Pause,
  PawPrint,
  Peace,
  PencilSimple,
  Phone,
  PhoneDisconnect,
  Play,
  Plus,
  PlusCircle,
  Presentation,
  Prohibit,
  PushPin,
  PushPinSlash,
  Quotes,
  ShareNetwork,
  Shield,
  ShieldWarning,
  SignIn,
  SignOut,
  Smiley,
  SmileySticker,
  SortAscending,
  SpeakerHigh,
  SpeakerSlash,
  SquaresFour,
  Star,
  Sticker,
  Stop,
  Sun,
  Terminal,
  TextAa,
  TextB,
  TextHOne,
  TextHThree,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
  TextUnderline,
  Trash,
  Tray,
  TreeStructure,
  User,
  UserCircle,
  UserMinus,
  UserPlus,
  UsersThree,
  VideoCamera,
  VideoCameraSlash,
  Warning,
  X,
};
