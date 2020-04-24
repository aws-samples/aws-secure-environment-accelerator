import * as aws from 'aws-sdk';
import { CreateResourceShareRequest, CreateResourceShareResponse } from 'aws-sdk/clients/ram';

export class RAM {
  private readonly client: aws.RAM;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.RAM({
      credentials,
    });
  }

  async enableSharingWithAwsOrganization(): Promise<void> {
    await this.client.enableSharingWithAwsOrganization({}).promise();
  }

  /**
   * to create resource share
   * @param input 
   */
  async createResourceShare(input: CreateResourceShareRequest): Promise<CreateResourceShareResponse> {
    return this.client.createResourceShare(input).promise();
  }
}
