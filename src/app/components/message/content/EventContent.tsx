import { Box } from 'folds';
import { ReactNode, ComponentType } from 'react';
import type { IconProps } from '@phosphor-icons/react';
import { MessageLayout } from '$state/settings';
import { BubbleLayout, CompactLayout, ModernLayout } from '$components/message/layout';
import { PhosphorIcon } from '$components/PhosphorIcon';

export type EventContentProps = {
  messageLayout: number;
  time: ReactNode;
  icon: ComponentType<IconProps>;
  content: ReactNode;
};
export function EventContent({ messageLayout, time, icon, content }: EventContentProps) {
  const beforeJSX = (
    <Box gap="300" justifyContent="SpaceBetween" alignItems="Center" grow="Yes">
      {messageLayout === MessageLayout.Compact && time}
      <Box
        grow={messageLayout === MessageLayout.Compact ? undefined : 'Yes'}
        alignItems="Center"
        justifyContent="Center"
      >
        <PhosphorIcon style={{ opacity: 0.6 }} size="50" as={icon} />
      </Box>
    </Box>
  );

  const msgContentJSX = (
    <Box justifyContent="SpaceBetween" alignItems="Baseline" gap="200">
      {content}
      {messageLayout !== MessageLayout.Compact && time}
    </Box>
  );

  if (messageLayout === MessageLayout.Compact) {
    return <CompactLayout before={beforeJSX}>{msgContentJSX}</CompactLayout>;
  }
  if (messageLayout === MessageLayout.Bubble) {
    return (
      <BubbleLayout hideBubble before={beforeJSX}>
        {msgContentJSX}
      </BubbleLayout>
    );
  }
  return <ModernLayout before={beforeJSX}>{msgContentJSX}</ModernLayout>;
}
