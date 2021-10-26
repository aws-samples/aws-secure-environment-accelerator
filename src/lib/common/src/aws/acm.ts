import aws from './aws-client';
import * as acm from 'aws-sdk/clients/acm';
import { throttlingBackOff } from './backoff';

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
    return throttlingBackOff(() => this.client.importCertificate(params).promise());
  }

  /**
   * to request ACM certificate
   * @param params
   */
  async requestCertificate(params: acm.RequestCertificateRequest): Promise<acm.RequestCertificateResponse> {
    return throttlingBackOff(() => this.client.requestCertificate(params).promise());
  }
}
