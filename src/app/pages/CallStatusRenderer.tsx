import { useAtomValue } from 'jotai';
import { useCallEmbed } from '../hooks/useCallEmbed';
import { CallStatus } from '../features/call-status';
import { LivekitCallStatus } from '../features/call-status/LivekitCallStatus';
import { NativeCallStatus } from '../features/call-status/NativeCallStatus';
import { livekitJsCallAtom } from '../state/livekitJsCall';
import { nativeCallAtom, selectActiveCallSessionIncludingNative } from '../state/nativeCall';
import { useSelectedRoom } from '../hooks/router/useSelectedRoom';
import { ScreenSize, useScreenSizeContext } from '../hooks/useScreenSize';

export function CallStatusRenderer() {
  const callEmbed = useCallEmbed();
  const livekitJsCall = useAtomValue(livekitJsCallAtom);
  const nativeCall = useAtomValue(nativeCallAtom);
  const selectedRoom = useSelectedRoom();

  const screenSize = useScreenSizeContext();
  const mobileInCallRoom = screenSize === ScreenSize.Mobile;

  const activeCall = selectActiveCallSessionIncludingNative(callEmbed, livekitJsCall, nativeCall);
  if (!activeCall) return null;
  if (mobileInCallRoom && activeCall.roomId === selectedRoom) return null;

  if (callEmbed && activeCall === callEmbed) return <CallStatus callEmbed={callEmbed} />;
  if (livekitJsCall && activeCall === livekitJsCall)
    return <LivekitCallStatus session={livekitJsCall} />;
  if (nativeCall && activeCall === nativeCall) return <NativeCallStatus session={nativeCall} />;

  return null;
}
