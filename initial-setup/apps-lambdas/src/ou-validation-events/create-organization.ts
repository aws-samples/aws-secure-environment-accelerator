import { ServiceControlPolicy } from '@aws-pbmm/common-lambda/lib/scp';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { ScheduledEvent } from 'aws-lambda';

interface OrganizationChangeEvent extends ScheduledEvent {
  version?: string;
}

const acceleratorPrefix = process.env.ACCELERATOR_PREFIX!;
const ignoredOrganizationalUnitsString = process.env.IGNORED_OUS! || '';
const acceleratorRoleName = process.env.ACCELERATOR_STATEMACHINE_ROLENAME!;
const organizationAdminRole = process.env.ORGANIZATIONS_ADMIN_ROLE!;
const ignoredOus = ignoredOrganizationalUnitsString.split(',');

const organizations = new Organizations();

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
  const parentId = requestDetail.requestParameters.parentId;
  const responseParameters = requestDetail.responseElements?.organizationalUnit;
  if (!responseParameters) {
    console.log(`Organizational unit crestion failed ${requestDetail.responseElements}`);
    return;
  }
  const roots = await organizations.listRoots();
  const rootId = roots[0].Id;

  if (parentId !== rootId) {
    console.log(`Child OrganizationalUnit Created, Nothing to perform`);
    return;
  }
  const { name, id } = responseParameters;
  if (ignoredOus.includes(name)) {
    console.log(`Organization ${name} is in Ignored Organizations list, Ignoring`);
    return;
  }
  await addQuarantineScp(id);
  return 'SUCCESS';
};

async function addQuarantineScp(targetId: string) {
  const scps = new ServiceControlPolicy(acceleratorPrefix, organizationAdminRole, organizations);
  const policyId = await scps.createOrUpdateQuarantineScp();

  console.log(`Attaching SCP "QNO SCP" to Organization "${targetId}"`);
  await organizations.attachPolicy(policyId, targetId);
}
