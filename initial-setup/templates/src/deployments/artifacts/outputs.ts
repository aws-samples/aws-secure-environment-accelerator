import { createCfnStructuredOutput } from '../../common/structured-output';
import { ArtifactOutputType } from '@aws-pbmm/common-outputs/lib/artifacts';
export { ArtifactOutput, ArtifactOutputType, ArtifactName } from '@aws-pbmm/common-outputs/lib/artifacts';

export const CfnArtifactOutput = createCfnStructuredOutput(ArtifactOutputType);
