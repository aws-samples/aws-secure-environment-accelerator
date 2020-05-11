import { AcceleratorStackProps, AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import * as cdk from '@aws-cdk/core';
import { Account } from '../utils/accounts';
import * as lambda from '@aws-cdk/aws-lambda';
import { CfnHub } from '@aws-cdk/aws-securityhub';
import * as cfn from '@aws-cdk/aws-cloudformation';
import * as config from '@aws-pbmm/common-lambda/lib/config';

export interface SubAccount {
  AccountId: string;
  Email: string;
}
export interface SecurityHubProps {
  account: Account;
  enableStandardsFuncArn: string;
  inviteMembersFuncArn: string;
  acceptInvitationFuncArn: string;
  standards: config.SecurityHubFrameworksConfig;
  subAccountIds?: SubAccount[];
  masterAccountId?: string;
}

export class SecurityHubStack extends cdk.Construct {
  constructor(scope: cdk.Construct, name: string, props: SecurityHubProps) {
    super(scope, name, );
    const {
      account,
      enableStandardsFuncArn,
      inviteMembersFuncArn,
      acceptInvitationFuncArn,
      subAccountIds,
      masterAccountId,
      standards,
    } = props;

    const enableHub = new CfnHub(this, `EnableSecurityHub-${account.key}`, {});

    const enableSecurityHubLambda = lambda.Function.fromFunctionArn(
      this,
      'CfnEnableSecurityHub',
      enableStandardsFuncArn,
    );

    const enableSecurityHubResource = new cfn.CustomResource(this, `EnableSecurityHubStandards-${account.key}`, {
      provider: cfn.CustomResourceProvider.fromLambda(enableSecurityHubLambda),
      properties: {
        AccountID: cdk.Aws.ACCOUNT_ID,
        Standards: standards.standards,
      },
    });
    enableSecurityHubResource.node.addDependency(enableHub);

    if (subAccountIds) {
      // Send Invites to subaccounts
      const sendInvitesLambda = lambda.Function.fromFunctionArn(
        this,
        'CfnInviteMembersSecurityHub',
        inviteMembersFuncArn,
      );

      const sendInviteSecurityHubResource = new cfn.CustomResource(
        this,
        `InviteMembersSecurityHubStandards-${account.key}`,
        {
          provider: cfn.CustomResourceProvider.fromLambda(sendInvitesLambda),
          properties: {
            AccountID: cdk.Aws.ACCOUNT_ID,
            MemberAccounts: subAccountIds?.filter(x => x.AccountId !== account.id),
          },
        },
      );
      sendInviteSecurityHubResource.node.addDependency(enableHub);
    } else {
      // Accept Invite in sub account
      const acceptInvitesLambda = lambda.Function.fromFunctionArn(
        this,
        'CfnAcceptInviteSecurityHub',
        acceptInvitationFuncArn,
      );

      const acceptInviteSecurityHubResource = new cfn.CustomResource(
        this,
        `AcceptInviteSecurityHubStandards-${account.key}`,
        {
          provider: cfn.CustomResourceProvider.fromLambda(acceptInvitesLambda),
          properties: {
            AccountID: cdk.Aws.ACCOUNT_ID,
            MasterAccountID: masterAccountId,
          },
        },
      );
      acceptInviteSecurityHubResource.node.addDependency(enableHub);
    }
  }
}
