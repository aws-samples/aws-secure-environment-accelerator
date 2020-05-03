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

  async describePolicy(input: org.DescribePolicyRequest): Promise<org.DescribePolicyResponse> {
    return this.client.describePolicy(input).promise();
  }

  async createPolicy(input: org.CreatePolicyRequest): Promise<org.CreatePolicyResponse> {
    return this.client.createPolicy(input).promise();
  }

  async updatePolicy(input: org.UpdatePolicyRequest): Promise<org.UpdatePolicyResponse> {
    return this.client.updatePolicy(input).promise();
  }

  async enableAWSServiceAccess(servicePrincipal: string): Promise<void> {
    const params: org.EnableAWSServiceAccessRequest = {
      ServicePrincipal: servicePrincipal,
    };
    await this.client.enableAWSServiceAccess(params).promise();
  }

  async registerDelegatedAdministrator(accountId: string, servicePrincipal: string): Promise<void> {
    const params: org.RegisterDelegatedAdministratorRequest = {
      AccountId: accountId,
      ServicePrincipal: servicePrincipal,
    };
    await this.client.registerDelegatedAdministrator(params).promise();
  }
}
