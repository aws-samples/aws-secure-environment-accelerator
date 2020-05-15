import * as cdk from '@aws-cdk/core';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import * as iam from '@aws-cdk/aws-iam';

export interface CentralServicesStep2Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
}

/**
 * Enable Central Services Step 2
 * - Enable Cross Account Cross Region in monitoring accounts
 */
export async function step2(props: CentralServicesStep2Props) {
  const { accountStacks, config } = props;

  const centralSecurityServices = config['global-options']['central-security-services'];
  const centralOperationsServices = config['global-options']['central-operations-services'];

  if (centralSecurityServices && centralSecurityServices.cwl) {
    const accountStack = accountStacks.getOrCreateAccountStack(centralSecurityServices.account);
    await centralServicesSettings({
      scope: accountStack,
    });
  }

  if (centralOperationsServices && centralOperationsServices.cwl) {
    const accountStack = accountStacks.getOrCreateAccountStack(centralOperationsServices.account);
    await centralServicesSettings({
      scope: accountStack,
    });
  }
}

/**
 * Central CloudWatch Services Settings in Sub Account
 */
async function centralServicesSettings(props: { scope: cdk.Construct }) {
  const { scope } = props;
  new iam.CfnServiceLinkedRole(scope, 'CloudWatch-CrossAccountSharing', {
    awsServiceName: 'cloudwatch-crossaccount.amazonaws.com',
    description:
      'Allows CloudWatch to assume CloudWatch-CrossAccountSharing roles in remote accounts on behalf of the current account in order to display data cross-account, cross region ',
    customSuffix: '',
  });
}
