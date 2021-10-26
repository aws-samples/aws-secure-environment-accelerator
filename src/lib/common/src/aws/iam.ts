import aws from './aws-client';
import * as iam from 'aws-sdk/clients/iam';
import { throttlingBackOff } from './backoff';

export class IAM {
  private readonly client: aws.IAM;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.IAM({
      credentials,
    });
  }

  /**
   * to create aws service linked role.
   * @param awsServiceName
   */
  async createServiceLinkedRole(awsServiceName: string): Promise<iam.CreateServiceLinkedRoleResponse> {
    const params: iam.CreateServiceLinkedRoleRequest = {
      AWSServiceName: awsServiceName,
    };
    return throttlingBackOff(() => this.client.createServiceLinkedRole(params).promise());
  }
}
