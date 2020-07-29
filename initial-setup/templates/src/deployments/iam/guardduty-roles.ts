import * as iam from '@aws-cdk/aws-iam';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { createIamRoleOutput } from './outputs';
import { IamRoleProps } from './macie-roles';

export async function createGuardDutyRoles(props: IamRoleProps): Promise<void> {
  const { accountStacks, config } = props;
  const enableGuardDuty = config['global-options']['central-security-services'].guardduty;

  // skipping Guardduty if not enabled from config
  if (!enableGuardDuty) {
    return;
  }

  const masterOrgKey = config.getMandatoryAccountKey('master');
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterOrgKey);
  const guardDutyAdminRole = await createAdminRole(masterAccountStack);
  const guardDutyAdminSetupRole = await createAdminSetupRole(masterAccountStack);

  createIamRoleOutput(masterAccountStack, guardDutyAdminRole, 'GuardDutyAdminRole');
  createIamRoleOutput(masterAccountStack, guardDutyAdminSetupRole, 'GuardDutyAdminSetupRole');

  for (const [accountKey, _] of config.getAccountConfigs()) {
    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);
    const detectorRole = await createGetDetectorRole(accountStack);
    const publishRole = await createPublishRole(accountStack);

    createIamRoleOutput(accountStack, detectorRole, 'GuardDutyDetectorRole');
    createIamRoleOutput(accountStack, publishRole, 'GuardDutyPublishRole');
  }
}

export async function createAdminRole(stack: AccountStack) {
  const role = new iam.Role(stack, `Custom::GuardDutyAdminRole`, {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['organizations:*'],
      resources: ['*'],
    }),
  );

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['guardduty:EnableOrganizationAdminAccount'],
      resources: ['*'],
    }),
  );

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    }),
  );
  return role;
}

export async function createAdminSetupRole(stack: AccountStack) {
  const role = new iam.Role(stack, `Custom::GuardDutyAdminSetupRole`, {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: [
        'guardduty:ListDetectors',
        'guardduty:CreateMembers',
        'guardduty:UpdateOrganizationConfiguration',
        'guardduty:DescribeOrganizationConfiguration',
      ],
      resources: ['*'],
    }),
  );

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    }),
  );
  return role;
}

export async function createGetDetectorRole(stack: AccountStack) {
  const role = new iam.Role(stack, `Custom::GetDetectorIdRole`, {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['guardduty:ListDetectors'],
      resources: ['*'],
    }),
  );

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    }),
  );
  return role;
}

export async function createPublishRole(stack: AccountStack) {
  const role = new iam.Role(stack, `Custom::GuardDutyCreatePublishRole`, {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: [
        's3:CreateBucket',
        's3:GetBucketLocation',
        's3:ListAllMyBuckets',
        's3:PutBucketAcl',
        's3:PutBucketPublicAccessBlock',
        's3:PutBucketPolicy',
        's3:PutObject',
      ],
      resources: ['*'],
    }),
  );
  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: [
        'guardduty:createPublishingDestination',
        'guardduty:updatePublishingDestination',
        'guardduty:deletePublishingDestination',
        'guardduty:listPublishingDestinations',
      ],
      resources: ['*'],
    }),
  );
  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['kms:ListAliases'],
      resources: ['*'],
    }),
  );

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    }),
  );
  return role;
}
