/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { LoadBalancerOutput, LoadBalancerEndpointOutput } from '@aws-accelerator/common-outputs/src/elb';
import { StaticResourcesOutput } from '@aws-accelerator/common-outputs/src/static-resource';
import { createCfnStructuredOutput } from '../../common/structured-output';
export const CfnLoadBalancerOutput = createCfnStructuredOutput(LoadBalancerOutput);
export const CfnStaticResourcesOutput = createCfnStructuredOutput(StaticResourcesOutput);
export const CfnLoadBalancerEndpointOutput = createCfnStructuredOutput(LoadBalancerEndpointOutput);
