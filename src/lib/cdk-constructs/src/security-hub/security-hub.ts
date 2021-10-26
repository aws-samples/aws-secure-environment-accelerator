/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as cdk from '@aws-cdk/core';
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
