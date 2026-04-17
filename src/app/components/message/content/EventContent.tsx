import type { IconSrc } from 'folds';
import { Box, Icon } from 'folds';
import type { ReactNode } from 'react';
import { MessageLayout } from '$state/settings';
import { BubbleLayout, CompactLayout, ModernLayout } from '$components/message/layout';

export type EventContentProps = {
  messageLayout: number;
  time: ReactNode;
  iconSrc: IconSrc;
  content: ReactNode;
};
export function EventContent({ messageLayout, time, iconSrc, content }: EventContentProps) {
  const beforeJSX = (
    <Box gap="300" justifyContent="SpaceBetween" alignItems="Center" grow="Yes">
      {messageLayout === (MessageLayout.Compact as number) && time}
      <Box
        grow={messageLayout === (MessageLayout.Compact as number) ? undefined : 'Yes'}
        alignItems="Center"
        justifyContent="Center"
      >
        <Icon style={{ opacity: 0.6 }} size="50" src={iconSrc} />
      </Box>
    </Box>
  );

  const msgContentJSX = (
    <Box justifyContent="SpaceBetween" alignItems="Baseline" gap="200">
      {content}
      {messageLayout !== (MessageLayout.Compact as number) && time}
    </Box>
  );

  if (messageLayout === (MessageLayout.Compact as number)) {
    return <CompactLayout before={beforeJSX}>{msgContentJSX}</CompactLayout>;
  }
  if (messageLayout === (MessageLayout.Bubble as number)) {
    return (
      <BubbleLayout hideBubble before={beforeJSX}>
        {msgContentJSX}
      </BubbleLayout>
    );
  }
  return <ModernLayout before={beforeJSX}>{msgContentJSX}</ModernLayout>;
}
