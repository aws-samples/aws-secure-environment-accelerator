import * as aws from 'aws-sdk';
import * as cur from 'aws-sdk/clients/cur';

export class CUR {
  private readonly client: aws.CUR;

  public constructor(region: string, credentials?: aws.Credentials) {
    this.client = new aws.CUR({
      region,
      credentials,
    });
  }

  /**
   * to creates a new cost and usage report using the description that you provide
   * @param params
   */
  async putReportDefinition(params: cur.PutReportDefinitionRequest): Promise<cur.PutReportDefinitionResponse> {
    return this.client.putReportDefinition(params).promise();
  }
}
