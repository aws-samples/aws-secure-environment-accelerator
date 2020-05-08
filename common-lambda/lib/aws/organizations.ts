import * as aws from 'aws-sdk';
import * as org from 'aws-sdk/clients/organizations';
import { listWithNextToken, listWithNextTokenGenerator } from './next-token';

export class Organizations {
  private readonly client: aws.Organizations;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.Organizations({
      region: 'us-east-1', // us-east-1 is the only endpoint available for AWS Organizations
      credentials,
    });
  }

  async getOrganizationalUnit(organizationalUnitId: string): Promise<org.OrganizationalUnit | undefined> {
    const response = await this.client
      .describeOrganizationalUnit({
        OrganizationalUnitId: organizationalUnitId,
      })
      .promise();
    return response.OrganizationalUnit;
  }

  async getPolicyByName(
    input: org.ListPoliciesRequest & { Name: string },
  ): Promise<org.DescribePolicyResponse | undefined> {
    const name = input.Name;
    delete input.Name;

    const summaries = listWithNextTokenGenerator<org.ListPoliciesRequest, org.ListPoliciesResponse, org.PolicySummary>(
      this.client.listPolicies.bind(this.client),
      r => r.Policies!,
      input,
    );
    for await (const summary of summaries) {
      if (summary.Name === name) {
        return this.describePolicy({
          PolicyId: summary.Id!,
        });
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
   * to get information about a policy
   * @param policyId
   */
  async describePolicy(policyId: string): Promise<org.DescribePolicyResponse> {
    const params: org.DescribePolicyRequest = {
      PolicyId: policyId,
    };
    return this.client.describePolicy(params).promise();
  }

  /**
   * to create a policy
   * @param content
   * @param description
   * @param name
   * @param type
   */
  async createPolicy(
    content: string,
    description: string,
    name: string,
    type: string,
  ): Promise<org.CreatePolicyResponse> {
    const params: org.CreatePolicyRequest = {
      Content: content,
      Description: description,
      Name: name,
      Type: type,
    };
    return this.client.createPolicy(params).promise();
  }

  /**
   * to update the details of a policy
   * @param description
   * @param name
   * @param policyId
   */
  async updatePolicy(description: string, name: string, policyId: string): Promise<org.UpdatePolicyResponse> {
    const params: org.UpdatePolicyRequest = {
      Description: description,
      Name: name,
      PolicyId: policyId,
    };
    return this.client.updatePolicy(params).promise();
  }

  /**
   * to attach policy to an OU or account
   * @param policyId
   * @param targetId
   */
  async attachPolicy(policyId: string, targetId: string): Promise<void> {
    const params: org.AttachPolicyRequest = {
      PolicyId: policyId,
      TargetId: targetId,
    };
    await this.client.attachPolicy(params).promise();
  }

  /**
   * to detach policy from an OU or account
   * @param policyId
   * @param targetId
   */
  async detachPolicy(policyId: string, targetId: string): Promise<void> {
    const params: org.DetachPolicyRequest = {
      PolicyId: policyId,
      TargetId: targetId,
    };
    await this.client.detachPolicy(params).promise();
  }

  /**
   * to enable trusted access for a service
   * @param servicePrincipal
   */
  async enableAWSServiceAccess(servicePrincipal: string): Promise<void> {
    const params: org.EnableAWSServiceAccessRequest = {
      ServicePrincipal: servicePrincipal,
    };
    await this.client.enableAWSServiceAccess(params).promise();
  }

  /**
   * to register delegated administrator for a service
   * @param accountId
   * @param servicePrincipal
   */
  async registerDelegatedAdministrator(accountId: string, servicePrincipal: string): Promise<void> {
    const params: org.RegisterDelegatedAdministratorRequest = {
      AccountId: accountId,
      ServicePrincipal: servicePrincipal,
    };
    try {
      await this.client.registerDelegatedAdministrator(params).promise();
    } catch (e) {
      if (e.code === 'AccountAlreadyRegisteredException') {
        // ignore error
      } else {
        throw e;
      }
    }
  }
}
