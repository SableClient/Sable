import type {
  ClientWidgetApi,
  IWidgetApiAcknowledgeResponseData,
  IWidgetApiRequestData,
} from 'matrix-widget-api';
import { useCallback, useEffect, useState } from 'react';
import type { CallControl } from './CallControl';
import { CallControlEvent } from './CallControl';
import type { CallControlState } from './CallControlState';

export const useClientWidgetApiEvent = <T>(
  api: ClientWidgetApi | undefined,
  type: string,
  callback: (event: CustomEvent<T>) => void
) => {
  useEffect(() => {
    api?.on(`action:${type}`, callback);
    return () => {
      api?.off(`action:${type}`, callback);
    };
  }, [api, type, callback]);
};

export const useSendClientWidgetApiAction = (api: ClientWidgetApi) => {
  const sendWidgetAction = useCallback(
    async (
      action: string,
      data: IWidgetApiRequestData
    ): Promise<IWidgetApiAcknowledgeResponseData> => api.transport.send(action, data),
    [api]
  );

  return sendWidgetAction;
};

export const useCallControlState = (control: CallControl): CallControlState => {
  const [state, setState] = useState(control.getState());

  useEffect(() => {
    const handleUpdate = () => {
      setState(control.getState());
    };
    control.on(CallControlEvent.StateUpdate, handleUpdate);
    return () => {
      control.off(CallControlEvent.StateUpdate, handleUpdate);
    };
  }, [control]);

  return state;
};
