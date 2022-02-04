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

import * as t from 'io-ts';
import { createCfnStructuredOutput } from '../../common/structured-output';
import { ImageIdOutput } from '@aws-accelerator/common-outputs/src/ami-output';

export const OpenSearchRoleOutput = t.interface(
  {
    roleArn: t.string,
  },
  'OpenSearchRole',
);

export const OpenSearchLambdaProcessingRoleOutput = t.interface(
  {
    roleArn: t.string,
  },
  'OpenSearchLambdaProcessingRole',
);

export const OpenSearchClusterDNSOutput = t.interface(
  {
    clusterDNS: t.string,
  },
  'OpenSearchClusterDNS',
);

export const OpenSearchLambdaProcessingArnOutput = t.interface(
  {
    lambdaArn: t.string,
  },
  'OpenSearchSiemLambdaArn',
);

export type OpenSearchRoleOutput = t.TypeOf<typeof OpenSearchRoleOutput>;
export type OpenSearchLambdaProcessingRoleOutput = t.TypeOf<typeof OpenSearchLambdaProcessingRoleOutput>;
export type OpenSearchClusterDNSOutput = t.TypeOf<typeof OpenSearchClusterDNSOutput>;

export type OpenSearchLambdaProcessingArnOutput = t.TypeOf<typeof OpenSearchLambdaProcessingArnOutput>;

export const CfnOpenSearchRoleOutput = createCfnStructuredOutput(OpenSearchRoleOutput);
export const CfnOpenSearchLambdaProcessingRoleOutput = createCfnStructuredOutput(OpenSearchLambdaProcessingRoleOutput);
export const CfnOpenSearchClusterDnsOutput = createCfnStructuredOutput(OpenSearchClusterDNSOutput);
export const CfnOpenSearchSiemLambdaArnOutput = createCfnStructuredOutput(OpenSearchLambdaProcessingArnOutput);
