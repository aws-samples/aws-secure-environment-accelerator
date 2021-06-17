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
