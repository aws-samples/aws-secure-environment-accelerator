import { HostedZoneOutput } from '@aws-accelerator/common-outputs/src/hosted-zone';
import { createCfnStructuredOutput } from '../../common/structured-output';
export const CfnHostedZoneOutput = createCfnStructuredOutput(HostedZoneOutput);