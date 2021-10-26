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

import omit from 'lodash.omit';
import aws from './aws-client';
import * as org from 'aws-sdk/clients/organizations';
import { throttlingBackOff } from './backoff';
import { listWithNextToken, listWithNextTokenGenerator } from './next-token';
import { equalIgnoreCase } from './../util/common';

export interface OrganizationalUnit extends org.OrganizationalUnit {
  Path: string;
}

export class Organizations {
  private readonly client: aws.Organizations;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.Organizations({
      region: 'us-east-1', // us-east-1 is the only endpoint available for AWS Organizations
      credentials,
    });
  }

  async getOrganizationalUnit(organizationalUnitId: string): Promise<org.OrganizationalUnit | undefined> {
    const response = await throttlingBackOff(() =>
      this.client
        .describeOrganizationalUnit({
          OrganizationalUnitId: organizationalUnitId,
        })
        .promise(),
    );
    return response.OrganizationalUnit;
  }

  async describeOrganization(): Promise<org.OrganizationalUnit | undefined> {
    const response = await throttlingBackOff(() => this.client.describeOrganization().promise());
    return response.Organization;
  }

  async createOrganizationalUnit(name: string, parentId: string): Promise<org.OrganizationalUnit | undefined> {
    const organizationalUnit = await throttlingBackOff(() =>
      this.client
        .createOrganizationalUnit({
          Name: name,
          ParentId: parentId,
        })
        .promise(),
    );
    return organizationalUnit.OrganizationalUnit;
  }

  async getPolicyByName(input: org.ListPoliciesRequest & { Name: string }): Promise<org.Policy | undefined> {
    const summaries = listWithNextTokenGenerator<org.ListPoliciesRequest, org.ListPoliciesResponse, org.PolicySummary>(
      this.client.listPolicies.bind(this.client),
      r => r.Policies!,
      omit(input, 'Name'),
    );
    for await (const summary of summaries) {
      if (summary.Name === input.Name) {
        const describePolicy = await this.describePolicy(summary.Id!);
        return describePolicy.Policy;
      }
    }
    return undefined;
  }

  async listRoots(): Promise<org.Root[]> {
    return listWithNextToken<org.ListRootsRequest, org.ListRootsResponse, org.Root>(
      this.client.listRoots.bind(this.client),
      r => r.Roots!,
      {},
    );
  }

  async listAccounts(): Promise<org.Account[]> {
    return listWithNextToken<org.ListAccountsRequest, org.ListAccountsResponse, org.Account>(
      this.client.listAccounts.bind(this.client),
      r => r.Accounts!,
      {},
    );
  }

  async listAccountsForParent(parentId: string): Promise<org.Account[]> {
    return listWithNextToken<org.ListAccountsForParentRequest, org.ListAccountsForParentResponse, org.Account>(
      this.client.listAccountsForParent.bind(this.client),
      r => r.Accounts!,
      {
        ParentId: parentId,
      },
    );
  }

  async listParents(accountId: string): Promise<org.Parent[]> {
    return listWithNextToken<org.ListParentsRequest, org.ListParentsResponse, org.Parent>(
      this.client.listParents.bind(this.client),
      r => r.Parents!,
      {
        ChildId: accountId,
      },
    );
  }

  async listOrganizationalUnits(): Promise<org.OrganizationalUnit[]> {
    const result: org.OrganizationalUnit[] = [];

    const roots = await this.listRoots();
    // Build a queue of parent IDs we need to fetch the children for
    // Start with the roots
    const parentIdQueue = roots.map(root => root.Id!);
    let parentIdQueuePos = 0;
    while (parentIdQueuePos < parentIdQueue.length) {
      // Get the next parent ID in the queue
      const parentId = parentIdQueue[parentIdQueuePos++];
      const organizationalUnits = await this.listOrganizationalUnitsForParent(parentId);
      for (const child of organizationalUnits) {
        result.push(child);
        // Add child ID to the parent ID queue so we look for their children too
        parentIdQueue.push(child.Id!);
      }
    }
    return result;
  }

  async listOrganizationalUnitsForParent(parentId: string): Promise<org.OrganizationalUnit[]> {
    return listWithNextToken<
      org.ListOrganizationalUnitsForParentRequest,
      org.ListOrganizationalUnitsForParentResponse,
      org.OrganizationalUnit
    >(this.client.listOrganizationalUnitsForParent.bind(this.client), r => r.OrganizationalUnits!, {
      ParentId: parentId,
    });
  }

  async listPolicies(input: org.ListPoliciesRequest): Promise<org.PolicySummary[]> {
    return listWithNextToken<org.ListPoliciesRequest, org.ListPoliciesResponse, org.PolicySummary>(
      this.client.listPolicies.bind(this.client),
      r => r.Policies!,
      input,
    );
  }

  /**
   * to list policies for a target
   * @param input
   */
  async listPoliciesForTarget(input: org.ListPoliciesForTargetRequest): Promise<org.PolicySummary[]> {
    return listWithNextToken<org.ListPoliciesForTargetRequest, org.ListPoliciesForTargetResponse, org.PolicySummary>(
      this.client.listPoliciesForTarget.bind(this.client),
      r => r.Policies!,
      input,
    );
  }

  /**
   * to list targets for a policy
   * @param input
   */
  async listTargetsForPolicy(input: org.ListTargetsForPolicyRequest): Promise<org.PolicyTargetSummary[]> {
    return listWithNextToken<
      org.ListTargetsForPolicyRequest,
      org.ListTargetsForPolicyResponse,
      org.PolicyTargetSummary
    >(this.client.listTargetsForPolicy.bind(this.client), r => r.Targets!, input);
  }

  /**
   * to get information about a policy
   * @param policyId
   */
  async describePolicy(policyId: string): Promise<org.DescribePolicyResponse> {
    const params: org.DescribePolicyRequest = {
      PolicyId: policyId,
    };
    return throttlingBackOff(() => this.client.describePolicy(params).promise());
  }

  /**
   * to create a policy
   * @param content
   * @param description
   * @param name
   * @param type
   */
  async createPolicy(props: {
    type: string;
    name: string;
    description: string;
    content: string;
  }): Promise<org.CreatePolicyResponse> {
    const params: org.CreatePolicyRequest = {
      Content: props.content,
      Description: props.description,
      Name: props.name,
      Type: props.type,
    };
    return throttlingBackOff(() => this.client.createPolicy(params).promise());
  }

  /**
   * to update the details of a policy
   * @param content
   * @param description
   * @param name
   * @param policyId
   */
  async updatePolicy(props: {
    policyId: string;
    name?: string;
    description?: string;
    content?: string;
  }): Promise<org.UpdatePolicyResponse> {
    const params: org.UpdatePolicyRequest = {
      PolicyId: props.policyId,
      Content: props.content,
      Description: props.description,
      Name: props.name,
    };
    return throttlingBackOff(() => this.client.updatePolicy(params).promise());
  }

  /**
   * to attach policy to an OU or account
   * @param policyId
   * @param targetId
   */
  async attachPolicy(policyId: string, targetId: string): Promise<void> {
    await throttlingBackOff(() =>
      this.client
        .attachPolicy({
          PolicyId: policyId,
          TargetId: targetId,
        })
        .promise(),
    );
  }

  /**
   * to detach policy from an OU or account
   * @param policyId
   * @param targetId
   */
  async detachPolicy(policyId: string, targetId: string): Promise<void> {
    await throttlingBackOff(() =>
      this.client
        .detachPolicy({
          PolicyId: policyId,
          TargetId: targetId,
        })
        .promise(),
    );
  }

  /**
   * to enable trusted access for a service
   * @param servicePrincipal
   */
  async enableAWSServiceAccess(servicePrincipal: string): Promise<void> {
    await throttlingBackOff(() =>
      this.client
        .enableAWSServiceAccess({
          ServicePrincipal: servicePrincipal,
        })
        .promise(),
    );
  }

  /**
   * to register delegated administrator for a service
   * @param accountId
   * @param servicePrincipal
   */
  async registerDelegatedAdministrator(accountId: string, servicePrincipal: string): Promise<void> {
    try {
      await throttlingBackOff(() =>
        this.client
          .registerDelegatedAdministrator({
            AccountId: accountId,
            ServicePrincipal: servicePrincipal,
          })
          .promise(),
      );
    } catch (e) {
      if (e.code === 'AccountAlreadyRegisteredException') {
        // ignore error
      } else {
        throw e;
      }
    }
  }

  /**
   * to create aws account
   * @param email
   * @param accountName
   */
  async createAccount(
    email: string,
    accountName: string,
    roleName: string,
  ): Promise<org.CreateAccountStatus | undefined> {
    const accountStatus = await throttlingBackOff(() =>
      this.client
        .createAccount({
          AccountName: accountName,
          Email: email,
          RoleName: roleName,
        })
        .promise(),
    );
    return accountStatus.CreateAccountStatus;
  }

  /**
   * to get create account status
   * @param requestId
   */
  async createAccountStatus(requestId: string): Promise<org.CreateAccountStatus | undefined> {
    const accountStatus = await throttlingBackOff(() =>
      this.client
        .describeCreateAccountStatus({
          CreateAccountRequestId: requestId,
        })
        .promise(),
    );
    return accountStatus.CreateAccountStatus;
  }

  /**
   * to move account to Organization
   * @param accountId
   * @param parentOuId
   * @param destinationOuId
   */
  async moveAccount(params: org.MoveAccountRequest): Promise<void> {
    await throttlingBackOff(() => this.client.moveAccount(params).promise());
  }

  /**
   * to get account
   * @param accountId
   */
  async getAccount(accountId: string): Promise<org.Account | undefined> {
    const response = await throttlingBackOff(() =>
      this.client
        .describeAccount({
          AccountId: accountId,
        })
        .promise(),
    );
    return response.Account;
  }

  async getAccountByEmail(email: string): Promise<org.Account | undefined> {
    const accounts = await this.listAccounts();

    return accounts.find(a => equalIgnoreCase(a.Email!, email));
  }

  async getOrganizationalUnitWithPath(ouId: string): Promise<OrganizationalUnit> {
    const organizationalUnit = await this.getOrganizationalUnit(ouId);
    const parents = await this.getOrganizationParents(ouId, [organizationalUnit!]);
    const orgPath = parents
      .reverse()
      .map(parent => parent.Name)
      .join('/');
    return {
      Arn: organizationalUnit?.Arn,
      Id: organizationalUnit?.Id,
      Path: orgPath,
      // Changing Name of Organization to Parent Org which is under ROOT Ou to match with account from config
      Name: orgPath.split('/')[0],
    };
  }

  async getOrganizationParents(
    organizationUnitId: string,
    parents: org.OrganizationalUnit[],
  ): Promise<org.OrganizationalUnit[]> {
    const localParents = await this.listParents(organizationUnitId);
    if (localParents.length > 0 && localParents[0].Type !== 'ROOT') {
      const organizationUnits: org.OrganizationalUnit[] = [];
      for (const ou of localParents) {
        const organizationalUnit = await this.getOrganizationalUnit(ou.Id!);
        organizationUnits.push(organizationalUnit!);
      }
      parents.push(...organizationUnits);
      await this.getOrganizationParents(localParents[0].Id!, parents);
    }
    return parents;
  }
}
