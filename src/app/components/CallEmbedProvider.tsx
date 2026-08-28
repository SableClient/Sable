import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { useAutoJoinCall } from '$hooks/useAutoJoinCall';
import {
  CallEmbedContextProvider,
  CallEmbedRefContextProvider,
  useCallHangupEvent,
  useCallJoined,
  useCallThemeSync,
  useCallMemberSoundSync,
} from '$hooks/useCallEmbed';
import type { CallEmbed } from '$plugins/call';
import { useClientWidgetApiEvent, ElementWidgetActions } from '$plugins/call';
import { callChatAtom, callEmbedAtom, callEmbedStartErrorAtom } from '$state/callEmbed';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { IncomingCallModal } from '$features/call/IncomingCallModal';
import { toCallEmbedStartError } from '$plugins/call/callEmbedError';
import { LivekitJsCallManagerProvider } from '$features/call/livekitJsCallManager';
import { getNativeCallManager } from '$features/call/nativeCallManager';

function CallUtils({ embed }: { embed: CallEmbed }) {
  const setCallEmbed = useSetAtom(callEmbedAtom);
  const setCallEmbedStartError = useSetAtom(callEmbedStartErrorAtom);

  useCallMemberSoundSync(embed);
  useCallThemeSync(embed);

  const handleCallEnd = useCallback(() => {
    setCallEmbed(undefined);
  }, [setCallEmbed]);

  useCallHangupEvent(embed, handleCallEnd);
  useClientWidgetApiEvent(embed.call, ElementWidgetActions.Close, handleCallEnd);

  useEffect(() => {
    const disposeOnReady = embed.onReady(() => {
      setCallEmbedStartError(null);
    });
    const disposeOnCapabilitiesNotified = embed.onCapabilitiesNotified(() => {
      setCallEmbedStartError(null);
    });
    const disposeOnPreparingError = embed.onPreparingError((error) => {
      setCallEmbedStartError(toCallEmbedStartError(error));
    });

    return () => {
      disposeOnReady();
      disposeOnCapabilitiesNotified();
      disposeOnPreparingError();
    };
  }, [embed, setCallEmbedStartError]);

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
  const store = useStore();
  getNativeCallManager(store);
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
        <LivekitJsCallManagerProvider>
          <AutoJoinManager />
          {children}
        </LivekitJsCallManagerProvider>
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
