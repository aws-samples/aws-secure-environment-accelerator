import * as aws from 'aws-sdk';
import * as ec2 from 'aws-sdk/clients/ec2';
import { throttlingBackOff } from './backoff';

export class TagResources {
  private readonly client: aws.EC2;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.EC2({
      credentials,
    });
  }

  async createTags(input: ec2.CreateTagsRequest): Promise<void> {
    await await throttlingBackOff(() => this.client.createTags(input).promise());
  }

  async hasTag(input: ec2.DescribeTagsRequest): Promise<boolean> {
    const result = await throttlingBackOff(() => this.client.describeTags(input).promise());
    return result.Tags!.length > 0;
  }
}
