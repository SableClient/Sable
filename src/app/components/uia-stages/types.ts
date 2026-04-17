import type { AuthDict } from '$types/matrix-sdk';
import type { AuthStageData } from '$hooks/useUIAFlows';

export type StageComponentProps = {
  stageData: AuthStageData;
  submitAuthDict: (authDict: AuthDict) => void;
  onCancel: () => void;
};
