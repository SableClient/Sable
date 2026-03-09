import { ReactNode } from 'react';
import { useBackRoute } from '$hooks/useBackRoute';

type BackRouteHandlerProps = {
  children: (onBack: () => void) => ReactNode;
};
export function BackRouteHandler({ children }: BackRouteHandlerProps) {
  const goBack = useBackRoute();
  return children(goBack);
}
