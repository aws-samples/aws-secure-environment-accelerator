import * as cdk from '@aws-cdk/core';
import * as certificatemanager from '@aws-cdk/aws-certificatemanager';
import * as secrets from '@aws-cdk/aws-secretsmanager';
import * as s3 from '@aws-cdk/aws-s3';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { AcmImportCertificate } from '@custom-resources/acm-import-certificate';
import { AccountStacks } from '../../common/account-stacks';
import { pascalCase } from 'pascal-case';
import { createCertificateSecretName } from './outputs';

export interface CertificatesStep1Props {
  accountStacks: AccountStacks;
  centralBucket: s3.IBucket;
  config: c.AcceleratorConfig;
}

export async function step1(props: CertificatesStep1Props) {
  const { accountStacks, centralBucket: centralBucket, config } = props;

  for (const { accountKey, certificates } of config.getCertificateConfigs()) {
    if (certificates.length === 0) {
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    for (const certificate of certificates) {
      createCertificate({
        centralBucket,
        certificate,
        scope: accountStack,
      });
    }
  }
}

function createCertificate(props: {
  centralBucket: s3.IBucket;
  certificate: c.CertificateConfig;
  scope: cdk.Construct;
}) {
  const { scope, centralBucket, certificate } = props;

  const certificatePrettyName = pascalCase(certificate.name);
  let resource;
  if (c.ImportCertificateConfigType.is(certificate)) {
    // TODO Condition to check if `certificate.cert` and `certificate['priv-key']` exist

    resource = new AcmImportCertificate(scope, `Cert${certificatePrettyName}`, {
      name: certificate.name,
      certificateBucket: centralBucket,
      certificateBucketPath: certificate.cert,
      privateKeyBucket: centralBucket,
      privateKeyBucketPath: certificate['priv-key'],
      certificateChainBucket: centralBucket,
      certificateChainBucketPath: certificate.chain,
      ignoreLimitExceededException: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
  } else if (c.RequestCertificateConfigType.is(certificate)) {
    resource = new certificatemanager.Certificate(scope, `Cert${certificatePrettyName}`, {
      domainName: certificate.domain,
      subjectAlternativeNames: certificate.san,
      validationMethod: validationMethodFromConfig(certificate.validation),
    });
  } else {
    console.warn(`Unknown certificate config: ${certificate}`);
  }

  // Store the certificate ARN in secrets manager
  if (resource) {
    new secrets.CfnSecret(scope, `Cert${certificatePrettyName}Secret`, {
      name: createCertificateSecretName(certificate.name),
      description: `Certificate ARN for certificate ${certificate.name}`,
      secretString: resource.certificateArn,
    });
  }
}

function validationMethodFromConfig(validation: c.CertificateValidation): certificatemanager.ValidationMethod {
  if (validation === 'EMAIL') {
    return certificatemanager.ValidationMethod.EMAIL;
  }
  return certificatemanager.ValidationMethod.DNS;
}
