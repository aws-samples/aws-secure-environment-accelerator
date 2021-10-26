import { HostedZoneOutput } from '@aws-accelerator/common-outputs/src/hosted-zone';
import { StaticResourcesOutput } from '@aws-accelerator/common-outputs/src/static-resource';
import { createCfnStructuredOutput } from '../../common/structured-output';
export const CfnHostedZoneOutput = createCfnStructuredOutput(HostedZoneOutput);
export const CfnStaticResourcesOutput = createCfnStructuredOutput(StaticResourcesOutput);
