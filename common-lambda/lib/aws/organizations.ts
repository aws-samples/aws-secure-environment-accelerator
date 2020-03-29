import aws from 'aws-sdk';
import org from 'aws-sdk/clients/organizations';
import { listWithNextToken, listWithNextTokenGenerator } from './next-token';

export class Organizations {
  private readonly client: aws.Organizations;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.Organizations({
      region: 'us-east-1',
      credentials,
    });
  }

  async getPolicy(input: org.ListPoliciesRequest & { Name: string }): Promise<org.PolicySummary | undefined> {
    const name = input.Name;
    delete input.Name;

    const policies = await listWithNextTokenGenerator<org.ListPoliciesRequest,
      org.ListPoliciesResponse,
      org.PolicySummary>(this.client.listPolicies.bind(this.client), r => r.Policies!!, input);
    for await (const policy of policies) {
      if (policy.Name === name) {
        return policy;
      }
    }
    return undefined;
  }

  async listAccounts(): Promise<org.Account[]> {
    return listWithNextToken<org.ListAccountsRequest,
      org.ListAccountsResponse,
      org.Account>(this.client.listAccounts.bind(this.client), r => r.Accounts!!, {});
  }

  async listPolicies(input: org.ListPoliciesRequest): Promise<org.PolicySummary[]> {
    return listWithNextToken<org.ListPoliciesRequest,
      org.ListPoliciesResponse,
      org.PolicySummary>(this.client.listPolicies.bind(this.client), r => r.Policies!!, input);
  }

  async createPolicy(input: org.CreatePolicyRequest): Promise<org.CreatePolicyResponse> {
    return this.client.createPolicy(input).promise();
  }
}
