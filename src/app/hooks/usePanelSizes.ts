import { useMemo } from 'react';

export type PanelSizetItem = {
  layout: string;
  name: string;
};

export const usePanelSizeItems = (): PanelSizetItem[] =>
  useMemo(
    () => [
      {
        layout: 'roomSidebarWidth',
        name: 'Room Panel Width',
      },
      {
        layout: 'memberSidebarWidth',
        name: 'Member Panel Width',
      },
      {
        layout: 'threadSidebarWidth',
        name: 'Thread Panel Width',
      },
      {
        layout: 'threadRootHeight',
        name: 'Thread Root Height',
      },
      {
        layout: 'vcmsgSidebarWidth',
        name: 'VoiceCall Msg Panel Width',
      },
      {
        layout: 'widgetSidebarWidth',
        name: 'Widget Panel Width',
      },
      {
        layout: 'roomBannerHeight',
        name: 'Room Banner Height',
      },
    ],
    []
  );
