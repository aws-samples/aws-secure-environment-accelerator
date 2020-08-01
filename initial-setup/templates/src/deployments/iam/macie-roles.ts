import * as iam from '@aws-cdk/aws-iam';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { createIamRoleOutput } from './outputs';

export interface IamRoleProps {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
}

export async function createMacieRoles(props: IamRoleProps): Promise<void> {
  const { accountStacks, config } = props;

  const enableMacie = config['global-options']['central-security-services'].macie;
  // skipping Macie if not enabled from config
  if (!enableMacie) {
    return;
  }

  const masterOrgKey = config.getMandatoryAccountKey('master');
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterOrgKey);

  const macieAdminRole = await createMacieAdminRole(masterAccountStack);
  const macieEnableRole = await createMacieEnableRole(masterAccountStack);
  const macieUpdateConfigRole = await createMacieUpdateConfigRole(masterAccountStack);
  const macieMemberRole = await createMacieCreateMember(masterAccountStack);

  createIamRoleOutput(masterAccountStack, macieAdminRole, 'MacieAdminRole');
  createIamRoleOutput(masterAccountStack, macieEnableRole, 'MacieEnableRole');
  createIamRoleOutput(masterAccountStack, macieUpdateConfigRole, 'MacieUpdateConfigRole');
  createIamRoleOutput(masterAccountStack, macieMemberRole, 'MacieMemberRole');

  for (const [accountKey, _] of config.getAccountConfigs()) {
    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);
    const exportConfigRole = await createMacieExportConfigRole(accountStack);
    const updateSessionRole = await createMacieUpdateSessionRole(accountStack);

    createIamRoleOutput(accountStack, exportConfigRole, 'MacieExportConfigRole');
    createIamRoleOutput(accountStack, updateSessionRole, 'MacieUpdateSessionRole');
  }
}

export async function createMacieAdminRole(stack: AccountStack) {
  const role = new iam.Role(stack, 'Custom::MacieAdminRole', {
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
      actions: ['macie2:EnableOrganizationAdminAccount'],
      resources: ['*'],
    }),
  );
  return role;
}

export async function createMacieEnableRole(stack: AccountStack) {
  const role = new iam.Role(stack, `Custom::MacieEnableRole`, {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['iam:CreateServiceLinkedRole'],
      resources: ['*'],
    }),
  );
  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['macie2:EnableMacie'],
      resources: ['*'],
    }),
  );
  return role;
}

export async function createMacieExportConfigRole(stack: AccountStack) {
  const role = new iam.Role(stack, `Custom::MacieExportConfigRole`, {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['macie2:putClassificationExportConfiguration'],
      resources: ['*'],
    }),
  );
  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: [
        's3:CreateBucket',
        's3:GetBucketLocation',
        's3:ListAllMyBuckets',
        's3:PutBucketAcl',
        's3:PutBucketPolicy',
        's3:PutBucketPublicAccessBlock',
        's3:PutObject',
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
  return role;
}

export async function createMacieUpdateConfigRole(stack: AccountStack) {
  const role = new iam.Role(stack, `Custom::MacieUpdateConfigRole`, {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['macie2:UpdateOrganizationConfiguration'],
      resources: ['*'],
    }),
  );
  return role;
}

export async function createMacieUpdateSessionRole(stack: AccountStack) {
  const role = new iam.Role(stack, `Custom::MacieUpdateSessionRole`, {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['macie2:UpdateMacieSession'],
      resources: ['*'],
    }),
  );
  return role;
}

export async function createMacieCreateMember(stack: AccountStack) {
  const role = new iam.Role(stack, `Custom::MacieCreateMemberRole`, {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['macie2:CreateMember'],
      resources: ['*'],
    }),
  );
  return role;
}
