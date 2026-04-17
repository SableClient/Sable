import type { ComponentProps, HTMLAttributes } from 'react';
import { forwardRef } from 'react';
import classNames from 'classnames';
import { Box, Chip, Header, Icon, IconButton, Icons, Scroll, Text, as } from 'folds';
import { CodeHighlightRenderer } from '$components/code-highlight';
import { copyToClipboard } from '$utils/dom';
import * as css from './TextViewer.css';

type TextViewerContentProps = {
  text: string;
  langName: string;
  size?: ComponentProps<typeof Text>['size'];
} & HTMLAttributes<HTMLPreElement>;
export const TextViewerContent = forwardRef<HTMLPreElement, TextViewerContentProps>(
  ({ text, langName, size, className, ...props }, ref) => (
    <Text
      as="pre"
      size={size}
      className={classNames(css.TextViewerPre, `language-${langName}`, className)}
      {...props}
      ref={ref}
    >
      <CodeHighlightRenderer code={text} language={langName} allowDetect />
    </Text>
  )
);

export type TextViewerProps = {
  name: string;
  text: string;
  langName: string;
  requestClose: () => void;
};

export const TextViewer = as<'div', TextViewerProps>(
  ({ className, name, text, langName, requestClose, ...props }, ref) => {
    const handleCopy = () => {
      copyToClipboard(text);
    };

    return (
      <Box
        className={classNames(css.TextViewer, className)}
        direction="Column"
        {...props}
        ref={ref}
      >
        <Header className={css.TextViewerHeader} size="400">
          <Box grow="Yes" alignItems="Center" gap="200">
            <IconButton size="300" radii="300" onClick={requestClose}>
              <Icon size="50" src={Icons.ArrowLeft} />
            </IconButton>
            <Text size="T300" truncate>
              {name}
            </Text>
          </Box>
          <Box shrink="No" alignItems="Center" gap="200">
            <Chip variant="Primary" radii="300" onClick={handleCopy}>
              <Text size="B300">Copy All</Text>
            </Chip>
          </Box>
        </Header>

        <Box grow="Yes" className={css.TextViewerContent} direction="Column">
          <Scroll hideTrack variant="Background" visibility="Always">
            <TextViewerContent
              className={css.TextViewerPrePadding}
              text={text}
              langName={langName}
            />
          </Scroll>
        </Box>
      </Box>
    );
  }
);
