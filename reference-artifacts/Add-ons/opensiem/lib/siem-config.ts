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

import * as fs from 'fs';
import * as path from 'path';

const baseDir = path.join(__dirname, '..');
const configFileName = 'SiemConfig.json';

export interface SecurityGroupRuleConfig {
  type?: string[];
  tcpPorts?: number[];
  udpPorts?: number[];
  port?: number;
  description: string;
  toPort?: number;
  fromPort?: number;
  source: string;
}

export interface SecurityGroupConfig {
  name: string;
  inboundRules: SecurityGroupRuleConfig[];
  outboundRules: SecurityGroupRuleConfig[];
}

export interface SiemConfig {
  operationsAccountId: string;
  logArchiveAccountId: string;
  vpcId: string;
  region: string;
  securityGroups: SecurityGroupConfig[];
  appSubnets: string[];
  cognitoDomainPrefix: string;
  maxmindLicense?: string;
  openSearchDomainName: string;
  openSearchInstanceTypeMainNodes: string;
  openSearchInstanceTypeDataNodes: string;
  openSearchCapacityMainNodes: number;
  openSearchCapacityDataNodes: number;
  openSearchVolumeSize: number;
  openSearchConfiguration: string;
  lambdaLogProcessingRoleArn: string;
  s3LogBuckets: string[];
  siemVersion: string;
  enableLambdaSubscription: boolean;
  s3NotificationTopicNameOrExistingArn: string;
  organizationId: string;
}

export async function loadSiemConfig(): Promise<SiemConfig> {
  const content = fs.readFileSync(path.join(baseDir, configFileName));

  const siemConfig = JSON.parse(content.toString());

  return siemConfig;
}
