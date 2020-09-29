import { LoadBalancerOutput } from '@aws-accelerator/common-outputs/src/elb';
import { StaticResourcesOutput } from '@aws-accelerator/common-outputs/src/static-resource';
import { createCfnStructuredOutput } from '../../common/structured-output';
export const CfnLoadBalancerOutput = createCfnStructuredOutput(LoadBalancerOutput);
export const CfnStaticResourcesOutput = createCfnStructuredOutput(StaticResourcesOutput);
