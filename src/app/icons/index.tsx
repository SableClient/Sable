import { forwardRef } from 'react';
import type { CSSProperties, SVGProps } from 'react';
import classNames from 'classnames';
import {
  ArrowBendUpLeft,
  ArrowBendUpRight,
  ArrowClockwise,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  ArrowUp,
  At,
  Bell,
  BellRinging,
  BellSimpleRinging,
  BellSlash,
  Bookmark,
  Buildings,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  ChatCircle,
  ChatCircleDots,
  ChatsCircle,
  Check,
  Checks,
  ClipboardText,
  Clock,
  ClockCounterClockwise,
  Code,
  CodeBlock,
  Coffee,
  Compass,
  DotsThree,
  DotsThreeVertical,
  DownloadSimple,
  Envelope,
  EnvelopeSimple,
  Eye,
  EyeSlash,
  File,
  Flag,
  Funnel,
  Gear,
  Globe,
  HardDrives,
  Hash,
  Headphones,
  Heart,
  House,
  Image,
  Info,
  Leaf,
  Lightbulb,
  Link,
  ListBullets,
  ListNumbers,
  Lock,
  MagnifyingGlass,
  MarkdownLogo,
  Microphone,
  MicrophoneSlash,
  Minus,
  Monitor,
  PaperPlaneRight,
  Paperclip,
  Pause,
  Peace,
  PencilSimple,
  Phone,
  PhoneDisconnect,
  Planet,
  Play,
  Plus,
  PlusCircle,
  Power,
  Prohibit,
  ProhibitInset,
  PushPin,
  Quotes,
  Screencast,
  Shield,
  ShieldCheck,
  ShieldWarning,
  SlidersHorizontal,
  Smiley,
  SmileySticker,
  SoccerBall,
  SortAscending,
  SpeakerHigh,
  SpeakerSlash,
  SquaresFour,
  Star,
  Sticker,
  Sun,
  Terminal,
  TextAa,
  TextB,
  TextHOne,
  TextHThree,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
  TextT,
  TextUnderline,
  Trash,
  Tray,
  User,
  UserPlus,
  Video,
  VideoCamera,
  VideoCameraSlash,
  Warning,
  X,
  XCircle,
} from '@phosphor-icons/react';
import type { Icon as PhosphorIcon, IconWeight } from '@phosphor-icons/react';
import { config } from 'folds';

export type IconName =
  | 'Home'
  | 'User'
  | 'UserPlus'
  | 'Mail'
  | 'MailPlus'
  | 'Star'
  | 'PlusCircle'
  | 'Explore'
  | 'Smile'
  | 'SmilePlus'
  | 'Leaf'
  | 'Sticker'
  | 'Delete'
  | 'Phone'
  | 'PhoneDown'
  | 'Headphone'
  | 'HeadphoneMute'
  | 'Send'
  | 'Bell'
  | 'BellRing'
  | 'BellPing'
  | 'BellMute'
  | 'Message'
  | 'MessageUnread'
  | 'Setting'
  | 'Search'
  | 'Heart'
  | 'Play'
  | 'Pause'
  | 'Sun'
  | 'Photo'
  | 'Lock'
  | 'Vlc'
  | 'Flag'
  | 'Ball'
  | 'Bulb'
  | 'Terminal'
  | 'Pencil'
  | 'Info'
  | 'Shield'
  | 'ShieldLock'
  | 'ShieldUser'
  | 'Cup'
  | 'Pin'
  | 'VolumeHigh'
  | 'VolumeHighLock'
  | 'VolumeHighGlobe'
  | 'VolumeMute'
  | 'File'
  | 'Category'
  | 'Peace'
  | 'Eye'
  | 'EyeBlind'
  | 'Warning'
  | 'Funnel'
  | 'Bookmark'
  | 'Inbox'
  | 'Thread'
  | 'ThreadPlus'
  | 'ThreadUnread'
  | 'ThreadReply'
  | 'Monitor'
  | 'ScreenShare'
  | 'Server'
  | 'Prohibited'
  | 'NoEntry'
  | 'Mic'
  | 'MicMute'
  | 'VideoCamera'
  | 'VideoCameraMute'
  | 'BlockQuote'
  | 'Hash'
  | 'HashLock'
  | 'HashGlobe'
  | 'HashSearch'
  | 'HashPlus'
  | 'Space'
  | 'SpaceLock'
  | 'SpaceGlobe'
  | 'SpaceSearch'
  | 'SpacePlus'
  | 'ChevronRight'
  | 'ChevronLeft'
  | 'ChevronTop'
  | 'ChevronBottom'
  | 'Plus'
  | 'Minus'
  | 'Cross'
  | 'VerticalDots'
  | 'HorizontalDots'
  | 'Check'
  | 'CheckTwice'
  | 'Download'
  | 'External'
  | 'Clock'
  | 'RecentClock'
  | 'Power'
  | 'ReplyArrow'
  | 'ArrowGoRight'
  | 'ArrowGoRightPlus'
  | 'ArrowGoRightCross'
  | 'ArrowGoLeft'
  | 'Markdown'
  | 'Attachment'
  | 'Alphabet'
  | 'ClipboardText'
  | 'AlphabetUnderline'
  | 'Text'
  | 'Heading1'
  | 'Heading2'
  | 'Heading3'
  | 'Bold'
  | 'Italic'
  | 'Underline'
  | 'Strike'
  | 'Link'
  | 'Code'
  | 'BlockCode'
  | 'OrderList'
  | 'UnorderList'
  | 'Mention'
  | 'Filter'
  | 'Sort'
  | 'ArrowUpDown'
  | 'ArrowRight'
  | 'ArrowLeft'
  | 'ArrowTop'
  | 'ArrowBottom'
  | 'ArrowDropRight'
  | 'ArrowDropLeft'
  | 'ArrowDropTop'
  | 'ArrowDropBottom'
  | 'Reload'
  | 'Globe';

export type IconSrc = PhosphorIcon;

export const Icons = {
  Home: House,
  User,
  UserPlus,
  Mail: Envelope,
  MailPlus: EnvelopeSimple,
  Star,
  PlusCircle,
  Explore: Compass,
  Smile: Smiley,
  SmilePlus: SmileySticker,
  Leaf,
  Sticker,
  Delete: Trash,
  Phone,
  PhoneDown: PhoneDisconnect,
  Headphone: Headphones,
  HeadphoneMute: SpeakerSlash,
  Send: PaperPlaneRight,
  Bell,
  BellRing: BellRinging,
  BellPing: BellSimpleRinging,
  BellMute: BellSlash,
  Message: ChatCircle,
  MessageUnread: ChatCircleDots,
  Setting: Gear,
  Search: MagnifyingGlass,
  Heart,
  Play,
  Pause,
  Sun,
  Photo: Image,
  Lock,
  Vlc: Video,
  Flag,
  Ball: SoccerBall,
  Bulb: Lightbulb,
  Terminal,
  Pencil: PencilSimple,
  Info,
  Shield,
  ShieldLock: ShieldCheck,
  ShieldUser: ShieldWarning,
  Cup: Coffee,
  Pin: PushPin,
  VolumeHigh: SpeakerHigh,
  VolumeHighLock: SpeakerHigh,
  VolumeHighGlobe: SpeakerHigh,
  VolumeMute: SpeakerSlash,
  File,
  Category: SquaresFour,
  Peace,
  Eye,
  EyeBlind: EyeSlash,
  Warning,
  Funnel,
  Bookmark,
  Inbox: Tray,
  Thread: ChatsCircle,
  ThreadPlus: ChatsCircle,
  ThreadUnread: ChatCircleDots,
  ThreadReply: ChatsCircle,
  Monitor,
  ScreenShare: Screencast,
  Server: HardDrives,
  Prohibited: Prohibit,
  NoEntry: ProhibitInset,
  Mic: Microphone,
  MicMute: MicrophoneSlash,
  VideoCamera,
  VideoCameraMute: VideoCameraSlash,
  BlockQuote: Quotes,
  Hash,
  HashLock: Lock,
  HashGlobe: Globe,
  HashSearch: Hash,
  HashPlus: Hash,
  Space: Planet,
  SpaceLock: Planet,
  SpaceGlobe: Globe,
  SpaceSearch: Planet,
  SpacePlus: Buildings,
  ChevronRight: CaretRight,
  ChevronLeft: CaretLeft,
  ChevronTop: CaretUp,
  ChevronBottom: CaretDown,
  Plus,
  Minus,
  Cross: X,
  VerticalDots: DotsThreeVertical,
  HorizontalDots: DotsThree,
  Check,
  CheckTwice: Checks,
  Download: DownloadSimple,
  External: ArrowSquareOut,
  Clock,
  RecentClock: ClockCounterClockwise,
  Power,
  ReplyArrow: ArrowBendUpLeft,
  ArrowGoRight: ArrowBendUpRight,
  ArrowGoRightPlus: PlusCircle,
  ArrowGoRightCross: XCircle,
  ArrowGoLeft: ArrowBendUpLeft,
  Markdown: MarkdownLogo,
  Attachment: Paperclip,
  Alphabet: TextAa,
  ClipboardText,
  AlphabetUnderline: TextAa,
  Text: TextT,
  Heading1: TextHOne,
  Heading2: TextHTwo,
  Heading3: TextHThree,
  Bold: TextB,
  Italic: TextItalic,
  Underline: TextUnderline,
  Strike: TextStrikethrough,
  Link,
  Code,
  BlockCode: CodeBlock,
  OrderList: ListNumbers,
  UnorderList: ListBullets,
  Mention: At,
  Filter: SlidersHorizontal,
  Sort: SortAscending,
  ArrowUpDown: SlidersHorizontal,
  ArrowRight,
  ArrowLeft,
  ArrowTop: ArrowUp,
  ArrowBottom: ArrowDown,
  ArrowDropRight: CaretRight,
  ArrowDropLeft: CaretLeft,
  ArrowDropTop: CaretUp,
  ArrowDropBottom: CaretDown,
  Reload: ArrowClockwise,
  Globe,
} satisfies Record<IconName, IconSrc>;

type IconSize = '50' | '100' | '200' | '300' | '400' | '500' | '600' | 'Inherit';

const iconSize: Record<IconSize, string> = {
  '50': config.size.X50,
  '100': config.size.X100,
  '200': config.size.X200,
  '300': config.size.X300,
  '400': config.size.X400,
  '500': config.size.X500,
  '600': config.size.X600,
  Inherit: config.size.XInherit,
};

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'src'> & {
  size?: IconSize;
  filled?: boolean;
  src: IconSrc;
};

export const Icon = forwardRef<SVGSVGElement, IconProps>(
  ({ className, size = '400', filled = false, src: IconComponent, style, ...props }, ref) => {
    const phosphorSize = iconSize[size];
    const iconStyle: CSSProperties = {
      flexShrink: 0,
      width: phosphorSize,
      height: phosphorSize,
      minWidth: phosphorSize,
      fontSize: phosphorSize,
      lineHeight: phosphorSize,
      ...style,
    };
    const weight: IconWeight = filled ? 'fill' : 'regular';

    return (
      <IconComponent
        className={classNames(className)}
        focusable="false"
        size={phosphorSize}
        weight={weight}
        style={iconStyle}
        ref={ref}
        {...props}
      />
    );
  }
);

Icon.displayName = 'Icon';
