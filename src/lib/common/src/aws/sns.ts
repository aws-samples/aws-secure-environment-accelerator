import aws from './aws-client';
import * as sns from 'aws-sdk/clients/sns';
import { throttlingBackOff } from './backoff';

export class SNS {
  private readonly client: aws.SNS;

  constructor(credentials?: aws.Credentials) {
    this.client = new aws.SNS({
      credentials,
    });
  }

  async publish(params: sns.PublishInput): Promise<sns.PublishResponse> {
    const response = await throttlingBackOff(() => this.client.publish(params).promise());
    return response;
  }
}
