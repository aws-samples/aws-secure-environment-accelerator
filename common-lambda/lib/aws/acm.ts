import * as aws from 'aws-sdk';
import * as acm from 'aws-sdk/clients/acm';
import { listWithNextToken, listWithNextTokenGenerator } from './next-token';

export class ACM {
  private readonly client: aws.ACM;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.ACM({
      credentials,
    });
  }

  /**
   * to import certificate into AWS Certificate Manager
   * @param certificate
   * @param privateKey
   * @param certificateArn
   * @param certificateChain
   * @param tagKey
   * @param tagValue
   */
  async importCertificate(
    certificate: string,
    privateKey: string,
    certificateArn: string,
    certificateChain: string,
    tagKey: string,
    tagValue: string,
  ): Promise<acm.ImportCertificateResponse> {
    const params: acm.ImportCertificateRequest = {
      Certificate: certificate,
      PrivateKey: privateKey,
      CertificateArn: certificateArn,
      CertificateChain: certificateChain,
      Tags: [
        {
          Key: tagKey,
          Value: tagValue,
        },
      ],
    };
    return this.client.importCertificate(params).promise();
  }

  /**
   * to request ACM certificate
   * @param domainName
   * @param certificateAuthorityArn
   * @param validationDomain
   * @param idempotencyToken
   * @param certificateTransparencyLoggingPreference
   * @param subjectAlternativeNames
   * @param validationMethod
   * @param tagKey
   * @param tagValue
   */
  async requestCertificate(
    domainName: string,
    certificateAuthorityArn: string,
    validationDomain: string,
    idempotencyToken: string,
    certificateTransparencyLoggingPreference: string,
    subjectAlternativeNames: string[],
    validationMethod: string,
    tagKey: string,
    tagValue: string,
  ): Promise<acm.RequestCertificateResponse> {
    const params: acm.RequestCertificateRequest = {
      DomainName: domainName,
      CertificateAuthorityArn: certificateAuthorityArn,
      DomainValidationOptions: [
        {
          DomainName: domainName,
          ValidationDomain: validationDomain,
        },
      ],
      IdempotencyToken: idempotencyToken,
      Options: {
        CertificateTransparencyLoggingPreference: certificateTransparencyLoggingPreference,
      },
      SubjectAlternativeNames: subjectAlternativeNames,
      Tags: [
        {
          Key: tagKey,
          Value: tagValue,
        },
      ],
      ValidationMethod: validationMethod,
    };
    return this.client.requestCertificate(params).promise();
  }

  async listCertificates(input: acm.ListCertificatesRequest): Promise<acm.CertificateSummary[]> {
    return listWithNextToken<acm.ListCertificatesRequest, acm.ListCertificatesResponse, acm.CertificateSummary>(
      this.client.listCertificates.bind(this.client),
      r => r.CertificateSummaryList!,
      input,
    );
  }
}
