import * as cdk from '@aws-cdk/core';
import { CfnHub } from '@aws-cdk/aws-securityhub';
import { SecurityHubEnable } from '@custom-resources/security-hub-enable';
import { SecurityHubSendInvites } from '@custom-resources/security-hub-send-invites';
import { SecurityHubAcceptInvites } from '@custom-resources/security-hub-accept-invites';

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
  'controls-to-disable': string[];
}

interface SecurityHubStandards {
  standards: SecurityHubStandard[];
}

export interface SecurityHubProps {
  account: Account;
  standards: SecurityHubStandards;
  subAccountIds?: SubAccount[];
  masterAccountId?: string;
}

export class SecurityHub extends cdk.Construct {
  constructor(scope: cdk.Construct, name: string, props: SecurityHubProps) {
    super(scope, name);
    const { account, subAccountIds, masterAccountId, standards } = props;

    const enableHub = new CfnHub(this, `EnableSecurityHub-${account.key}`, {});

    const enableSecurityHubResource = new SecurityHubEnable(this, `EnableSecurityHubStandards-${account.key}`, {
      standards: standards.standards,
    });

    enableSecurityHubResource.node.addDependency(enableHub);

    if (subAccountIds) {
      // Send Invites to subaccounts
      const sendInviteSecurityHubResource = new SecurityHubSendInvites(
        this,
        `InviteMembersSecurityHubStandards-${account.key}`,
        {
          memberAccounts: subAccountIds?.filter(x => x.AccountId !== account.id),
        },
      );
      sendInviteSecurityHubResource.node.addDependency(enableHub);
    } else {
      // Accept Invite in sub account
      if (!masterAccountId) {
        console.log('Invalid Request. No "masterAccountId" found');
      } else {
        const acceptInviteSecurityHubResource = new SecurityHubAcceptInvites(
          this,
          `AcceptInviteSecurityHubStandards-${account.key}`,
          {
            masterAccountId,
          },
        );
        acceptInviteSecurityHubResource.node.addDependency(enableHub);
      }
    }
  }
}
