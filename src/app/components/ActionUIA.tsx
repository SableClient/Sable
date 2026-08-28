import type { ReactNode } from 'react';
import type { AuthDict, IAuthData, UIAFlow } from '$types/matrix-sdk';
import { AuthType } from '$types/matrix-sdk';
import { getUIAFlowForStages } from '$utils/matrix-uia';
import { useSupportedUIAFlows, useUIACompleted, useUIAFlow } from '$hooks/useUIAFlows';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { UIAFlowOverlay } from './UIAFlowOverlay';
import { OAuthStage, PasswordStage, SSOStage } from './uia-stages';

// MSC4312 unstable prefix for m.oauth.
export const OAUTH_UNSTABLE_STAGE = 'org.matrix.cross_signing_reset';

const SUPPORTED_IN_APP_UIA_STAGES = [
  AuthType.Password,
  AuthType.Sso,
  AuthType.OAuth,
  OAUTH_UNSTABLE_STAGE,
];

const pickUIAFlow = (uiaFlows: UIAFlow[]): UIAFlow | undefined => {
  const passwordFlow = getUIAFlowForStages(uiaFlows, [AuthType.Password]);
  if (passwordFlow) return passwordFlow;
  const oauthFlow =
    getUIAFlowForStages(uiaFlows, [AuthType.OAuth]) ??
    getUIAFlowForStages(uiaFlows, [OAUTH_UNSTABLE_STAGE]);
  if (oauthFlow) return oauthFlow;
  return getUIAFlowForStages(uiaFlows, [AuthType.Sso]);
};

type ActionUIAProps = {
  authData: IAuthData;
  ongoingFlow: UIAFlow;
  action: (authDict: AuthDict) => void;
  onCancel: () => void;
};
export function ActionUIA({ authData, ongoingFlow, action, onCancel }: ActionUIAProps) {
  const mx = useMatrixClient();
  const completed = useUIACompleted(authData);
  const { getStageToComplete } = useUIAFlow(authData, ongoingFlow);

  const stageToComplete = getStageToComplete();

  if (!stageToComplete) return null;
  return (
    <UIAFlowOverlay
      currentStep={completed.length + 1}
      stepCount={ongoingFlow.stages.length}
      onCancel={onCancel}
    >
      {stageToComplete.type === (AuthType.Password as string) && (
        <PasswordStage
          userId={mx.getUserId()!}
          stageData={stageToComplete}
          onCancel={onCancel}
          submitAuthDict={action}
        />
      )}
      {stageToComplete.type === (AuthType.Sso as string) && stageToComplete.session && (
        <SSOStage
          ssoRedirectURL={mx.getFallbackAuthUrl(AuthType.Sso, stageToComplete.session)}
          stageData={stageToComplete}
          onCancel={onCancel}
          submitAuthDict={action}
        />
      )}
      {(stageToComplete.type === (AuthType.OAuth as string) ||
        stageToComplete.type === OAUTH_UNSTABLE_STAGE) &&
        stageToComplete.session && (
          <OAuthStage stageData={stageToComplete} onCancel={onCancel} submitAuthDict={action} />
        )}
    </UIAFlowOverlay>
  );
}

type ActionUIAFlowsLoaderProps = {
  authData: IAuthData;
  unsupported: () => ReactNode;
  children: (ongoingFlow: UIAFlow) => ReactNode;
};
export function ActionUIAFlowsLoader({
  authData,
  unsupported,
  children,
}: ActionUIAFlowsLoaderProps) {
  const supportedFlows = useSupportedUIAFlows(authData.flows ?? [], SUPPORTED_IN_APP_UIA_STAGES);
  const ongoingFlow = supportedFlows.length > 0 ? pickUIAFlow(supportedFlows) : undefined;

  if (!ongoingFlow) return unsupported();

  return children(ongoingFlow);
}
