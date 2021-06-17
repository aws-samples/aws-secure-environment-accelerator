/* eslint-disable @typescript-eslint/no-explicit-any */
import { observer } from 'mobx-react-lite';
import { SpaceBetween } from '@awsui/components-react';
import { OrganizationalUnitTable } from '../components/organizational-unit-table';

export interface StructureOrganizationStepProps {
  configuration: any;
}

export const StructureOrganizationStep = observer(function StructureOrganizationStep({
  configuration,
}: StructureOrganizationStepProps) {
  return (
    <SpaceBetween size="xxl">
      <OrganizationalUnitTable state={configuration} />
    </SpaceBetween>
  );
});
