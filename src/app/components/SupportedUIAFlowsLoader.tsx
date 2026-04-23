import type { ReactNode } from 'react';
import type { UIAFlow } from '$types/matrix-sdk';
import { useSupportedUIAFlows } from '$hooks/useUIAFlows';

export function SupportedUIAFlowsLoader({
  flows,
  supportedStages,
  children,
}: {
  supportedStages: string[];
  flows: UIAFlow[];
  children: (supportedFlows: UIAFlow[]) => ReactNode;
}) {
  const supportedFlows = useSupportedUIAFlows(flows, supportedStages);

  return children(supportedFlows);
}
