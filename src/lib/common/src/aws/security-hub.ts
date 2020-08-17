import * as aws from 'aws-sdk';
import {
  BatchEnableStandardsResponse,
  DescribeStandardsResponse,
  DescribeStandardsControlsResponse,
  UpdateStandardsControlResponse,
  ListInvitationsResponse,
  AcceptInvitationResponse,
  EnableSecurityHubResponse,
  InviteMembersResponse,
  CreateMembersResponse,
  CreateMembersRequest,
} from 'aws-sdk/clients/securityhub';

export class SecurityHub {
  private readonly client: aws.SecurityHub;
  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.SecurityHub({
      credentials,
    });
  }

  public enableSecurityHub(enableStandards: boolean): Promise<EnableSecurityHubResponse> {
    return this.client
      .enableSecurityHub({
        EnableDefaultStandards: enableStandards,
      })
      .promise();
  }

  public batchEnableStandards(standardsArns: string[]): Promise<BatchEnableStandardsResponse> {
    const params = standardsArns.map(x => {
      return {
        StandardsArn: x,
      };
    });
    return this.client
      .batchEnableStandards({
        StandardsSubscriptionRequests: params,
      })
      .promise();
  }

  public describeStandards(): Promise<DescribeStandardsResponse> {
    return this.client.describeStandards().promise();
  }

  public describeStandardControls(standardSubscriptionArn: string): Promise<DescribeStandardsControlsResponse> {
    return this.client
      .describeStandardsControls({
        StandardsSubscriptionArn: standardSubscriptionArn,
        MaxResults: 100,
      })
      .promise();
  }

  public updateStandardControls(standardsControlArn: string): Promise<UpdateStandardsControlResponse> {
    return this.client
      .updateStandardsControl({
        StandardsControlArn: standardsControlArn,
        ControlStatus: 'DISABLED',
        DisabledReason: 'Control disabled by Accelerator',
      })
      .promise();
  }

  public listInvitations(): Promise<ListInvitationsResponse> {
    return this.client.listInvitations().promise();
  }

  public inviteMembers(accountIds: string[]): Promise<InviteMembersResponse> {
    return this.client
      .inviteMembers({
        AccountIds: accountIds,
      })
      .promise();
  }

  public createMembers(members: CreateMembersRequest): Promise<InviteMembersResponse> {
    return this.client.createMembers(members).promise();
  }

  public acceptInvitation(invitationId: string, masterId: string): Promise<AcceptInvitationResponse> {
    return this.client
      .acceptInvitation({
        InvitationId: invitationId,
        MasterId: masterId,
      })
      .promise();
  }
}
