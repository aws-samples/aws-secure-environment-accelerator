import { createCfnStructuredOutput } from '../../common/structured-output';
import { ArtifactOutput } from '@aws-accelerator/common-outputs/src/artifacts';
export { ArtifactOutput, ArtifactOutputFinder, ArtifactName } from '@aws-accelerator/common-outputs/src/artifacts';

export const CfnArtifactOutput = createCfnStructuredOutput(ArtifactOutput);
