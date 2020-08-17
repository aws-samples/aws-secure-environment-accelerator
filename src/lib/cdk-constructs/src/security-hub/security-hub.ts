import * as cdk from '@aws-cdk/core';
import { CfnHub } from '@aws-cdk/aws-securityhub';
import { SecurityHubEnable } from '@aws-accelerator/custom-resource-security-hub-enable';
import { SecurityHubSendInvites } from '@aws-accelerator/custom-resource-security-hub-send-invites';
import { SecurityHubAcceptInvites } from '@aws-accelerator/custom-resource-security-hub-accept-invites';

export interface SubAccount {
  AccountId: string;
  Email: string;
}

export interface Account {
  key: string;
  id: string;
  name: string;
}

interface SecurityHubStandard {
  name: string;
  'controls-to-disable': string[] | undefined;
}

interface SecurityHubStandards {
  standards: SecurityHubStandard[];
}

export interface SecurityHubProps {
  account: Account;
  standards: SecurityHubStandards;
  roleArn: string;
  subAccountIds?: SubAccount[];
  masterAccountId?: string;
}

export class SecurityHub extends cdk.Construct {
  constructor(scope: cdk.Construct, name: string, props: SecurityHubProps) {
    super(scope, name);
    const { account, subAccountIds, masterAccountId, standards, roleArn } = props;

    const enableSecurityHubResource = new SecurityHubEnable(
      this,
      `EnableSecurityHubStandards-${account.key}-Settings`,
      {
        standards: standards.standards,
        roleArn,
      },
    );

    if (subAccountIds) {
      // Send Invites to subaccounts
      const sendInviteSecurityHubResource = new SecurityHubSendInvites(
        this,
        `InviteMembersSecurityHubStandards-${account.key}-Settings`,
        {
          memberAccounts: subAccountIds?.filter(x => x.AccountId !== account.id),
          roleArn,
        },
      );
      sendInviteSecurityHubResource.node.addDependency(enableSecurityHubResource);
    } else {
      // Accept Invite in sub account
      if (!masterAccountId) {
        console.log('Invalid Request. No "masterAccountId" found');
      } else {
        const acceptInviteSecurityHubResource = new SecurityHubAcceptInvites(
          this,
          `AcceptInviteSecurityHubStandards-${account.key}-Settings`,
          {
            masterAccountId,
            roleArn,
          },
        );
        acceptInviteSecurityHubResource.node.addDependency(enableSecurityHubResource);
      }
    }
  }
}
