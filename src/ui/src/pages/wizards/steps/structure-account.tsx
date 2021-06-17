/* eslint-disable @typescript-eslint/no-explicit-any */
import { observer } from 'mobx-react-lite';
import { SpaceBetween } from '@awsui/components-react';
import { AccountTable } from '../components/account-table';

export interface StructureAccountStepProps {
  configuration: any;
}

export const StructureAccountStep = observer(function StructureAccountStep({
  configuration,
}: StructureAccountStepProps) {
  return (
    <SpaceBetween size="xxl">
      <AccountTable state={configuration} accountType="mandatory" />
      <AccountTable state={configuration} accountType="workload" />
    </SpaceBetween>
  );
});
