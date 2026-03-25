import { ReactNode, useCallback, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useAutoJoinCall } from '$hooks/useAutoJoinCall';
import {
  CallEmbedContextProvider,
  CallEmbedRefContextProvider,
  useCallHangupEvent,
  useCallJoined,
  useCallThemeSync,
  useCallMemberSoundSync,
} from '$hooks/useCallEmbed';
import { CallEmbed, useClientWidgetApiEvent, ElementWidgetActions } from '$plugins/call';
import { callChatAtom, callEmbedAtom } from '$state/callEmbed';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { IncomingCallModal } from './IncomingCallModal';

function CallUtils({ embed }: { embed: CallEmbed }) {
  const setCallEmbed = useSetAtom(callEmbedAtom);

  useCallMemberSoundSync(embed);
  useCallThemeSync(embed);

  const handleCallEnd = useCallback(() => {
    setCallEmbed(undefined);
  }, [setCallEmbed]);

  useCallHangupEvent(embed, handleCallEnd);
  useClientWidgetApiEvent(embed.call, ElementWidgetActions.Close, handleCallEnd);

  return null;
}

type CallEmbedProviderProps = {
  children?: ReactNode;
};

function AutoJoinManager() {
  useAutoJoinCall();
  return null;
}

export function CallEmbedProvider({ children }: CallEmbedProviderProps) {
  const callEmbed = useAtomValue(callEmbedAtom);
  const callEmbedRef = useRef<HTMLDivElement>(null);
  const joined = useCallJoined(callEmbed);

  const selectedRoom = useSelectedRoom();
  const chat = useAtomValue(callChatAtom);
  const screenSize = useScreenSizeContext();

  const chatOnlyView = chat && screenSize !== ScreenSize.Desktop;

  const callVisible = callEmbed && selectedRoom === callEmbed.roomId && joined && !chatOnlyView;

  return (
    <CallEmbedContextProvider value={callEmbed}>
      <IncomingCallModal />
      {callEmbed && <CallUtils embed={callEmbed} />}
      <CallEmbedRefContextProvider value={callEmbedRef}>
        <AutoJoinManager />
        {children}
      </CallEmbedRefContextProvider>

      <div
        data-call-embed-container
        style={{
          visibility: callVisible ? undefined : 'hidden',
          position: 'fixed',
          zIndex: callVisible ? 10 : -1,
          pointerEvents: callVisible ? 'all' : 'none',
        }}
        ref={callEmbedRef}
      />
    </CallEmbedContextProvider>
  );
}
