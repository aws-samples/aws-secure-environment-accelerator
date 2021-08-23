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

export const RsyslogAutoScalingRoleOutput = t.interface(
  {
    roleArn: t.string,
  },
  'RsyslogAutoScalingRole',
);
export const RsyslogDnsOutputTypeOutput = t.interface(
  {
    name: t.string,
    dns: t.string,
  },
  'RsyslogNlbDns',
);

export type RsyslogAutoScalingRoleOutput = t.TypeOf<typeof RsyslogAutoScalingRoleOutput>;
export type RsyslogDnsOutputTypeOutput = t.TypeOf<typeof RsyslogDnsOutputTypeOutput>;
export const CfnRsyslogAutoScalingRoleOutput = createCfnStructuredOutput(RsyslogAutoScalingRoleOutput);
export const CfnRsyslogDnsOutputTypeOutput = createCfnStructuredOutput(RsyslogDnsOutputTypeOutput);
export const CfnRsyslogImageIdOutputTypeOutput = createCfnStructuredOutput(ImageIdOutput);
