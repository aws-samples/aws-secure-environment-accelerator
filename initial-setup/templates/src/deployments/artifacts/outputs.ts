import { createCfnStructuredOutput } from '../../common/structured-output';
import { ArtifactOutput } from '@aws-pbmm/common-outputs/lib/artifacts';
export { ArtifactOutput, ArtifactOutputFinder, ArtifactName } from '@aws-pbmm/common-outputs/lib/artifacts';

export const CfnArtifactOutput = createCfnStructuredOutput(ArtifactOutput);
