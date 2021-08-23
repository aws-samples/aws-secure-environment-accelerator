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

/* eslint-disable @typescript-eslint/no-explicit-any */
import { observer } from 'mobx-react-lite';
import { SpaceBetween } from '@awsui/components-react';
import { CidrPoolTable } from '../components/cidr-pool-table';
import { VpcTable } from '../components/vpc-table';
import { ZoneTable } from '../components/zone-table';

export interface ConfigureNetworkStepProps {
  configuration: any;
}

export const ConfigureNetworkStep = observer(function ConfigureNetworkStep({
  configuration,
}: ConfigureNetworkStepProps) {
  return (
    <SpaceBetween size="xxl">
      <CidrPoolTable state={configuration} />
      <VpcTable state={configuration} />
      <ZoneTable state={configuration} />
    </SpaceBetween>
  );
});
