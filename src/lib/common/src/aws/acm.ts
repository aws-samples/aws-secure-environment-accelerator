import * as aws from 'aws-sdk';
import * as acm from 'aws-sdk/clients/acm';

export class ACM {
  private readonly client: aws.ACM;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.ACM({
      credentials,
    });
  }

  /**
   * to import certificate into AWS Certificate Manager
   * @param params
   */
  async importCertificate(params: acm.ImportCertificateRequest): Promise<acm.ImportCertificateResponse> {
    return this.client.importCertificate(params).promise();
  }

  /**
   * to request ACM certificate
   * @param params
   */
  async requestCertificate(params: acm.RequestCertificateRequest): Promise<acm.RequestCertificateResponse> {
    return this.client.requestCertificate(params).promise();
  }
}
