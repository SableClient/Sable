import { useAtomValue } from 'jotai';
import { useCallEmbed } from '../hooks/useCallEmbed';
import { CallStatus } from '../features/call-status';
import { LivekitCallStatus } from '../features/call-status/LivekitCallStatus';
import { isLivekitJsCallActive, livekitJsCallAtom } from '../state/livekitJsCall';
import { useSelectedRoom } from '../hooks/router/useSelectedRoom';
import { ScreenSize, useScreenSizeContext } from '../hooks/useScreenSize';

export function CallStatusRenderer() {
  const callEmbed = useCallEmbed();
  const livekitJsCall = useAtomValue(livekitJsCallAtom);
  const selectedRoom = useSelectedRoom();

  const screenSize = useScreenSizeContext();
  const mobileInCallRoom = screenSize === ScreenSize.Mobile;

  if (callEmbed) {
    if (mobileInCallRoom && callEmbed.roomId === selectedRoom) return null;
    return <CallStatus callEmbed={callEmbed} />;
  }

  if (isLivekitJsCallActive(livekitJsCall) && livekitJsCall) {
    if (mobileInCallRoom && livekitJsCall.roomId === selectedRoom) return null;
    return <LivekitCallStatus session={livekitJsCall} />;
  }

  return null;
}
