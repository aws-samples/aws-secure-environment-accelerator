import * as aws from 'aws-sdk';
import * as org from 'aws-sdk/clients/organizations';
import { listWithNextToken, listWithNextTokenGenerator } from './next-token';

export class Organizations {
  private readonly client: aws.Organizations;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.Organizations({
      region: 'us-east-1',
      credentials,
    });
  }

  async getPolicyByName(input: org.ListPoliciesRequest & { Name: string }): Promise<org.DescribePolicyResponse | undefined> {
    const name = input.Name;
    delete input.Name;

    const summaries = listWithNextTokenGenerator<
      org.ListPoliciesRequest,
      org.ListPoliciesResponse,
      org.PolicySummary
    >(this.client.listPolicies.bind(this.client), (r) => r.Policies!, input);
    for await (const summary of summaries) {
      if (summary.Name === name) {
        return this.describePolicy({
          PolicyId: summary.Id!
        });
      }
    }
    return undefined;
  }

  async listAccounts(): Promise<org.Account[]> {
    return listWithNextToken<org.ListAccountsRequest, org.ListAccountsResponse, org.Account>(
      this.client.listAccounts.bind(this.client),
      (r) => r.Accounts!!,
      {},
    );
  }

  async listPolicies(input: org.ListPoliciesRequest): Promise<org.PolicySummary[]> {
    return listWithNextToken<org.ListPoliciesRequest, org.ListPoliciesResponse, org.PolicySummary>(
      this.client.listPolicies.bind(this.client),
      (r) => r.Policies!!,
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
}
