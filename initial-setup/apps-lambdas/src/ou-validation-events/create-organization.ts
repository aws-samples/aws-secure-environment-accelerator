import { ServiceControlPolicy } from '@aws-pbmm/common-lambda/lib/scp';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import { ScheduledEvent } from 'aws-lambda';

interface OrganizationChangeEvent extends ScheduledEvent {
  version?: string;
}

const acceleratorPrefix = process.env.ACCELERATOR_PREFIX! || 'PBMMAccel-';
const ignoredOrganizationalUnits = process.env.IGNORED_OUS! || [];
const acceleratorRoleName = process.env.ACCELERATOR_STATEMACHINE_ROLENAME! || 'PBMMAccel-L-SFN-MasterRole-DD650BE8';

export const handler = async (input: OrganizationChangeEvent) => {
  console.log(`Create Organizational Unit Event triggered ...`);
  console.log(JSON.stringify(input, null, 2));
  const requestDetail = input.detail;
  const invokedBy = requestDetail.userIdentity.sessionContext.sessionIssuer.userName;
  if (invokedBy === acceleratorRoleName) {
    console.log(`Move Account Performed by Accelerator, No operation required`);
    return {
      status: 'NO_OPERATION_REQUIRED',
    };
  }
  return 'SUCCESS';
};
