/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as cdk from '@aws-cdk/core';
import * as certificatemanager from '@aws-cdk/aws-certificatemanager';
import * as secrets from '@aws-cdk/aws-secretsmanager';
import * as s3 from '@aws-cdk/aws-s3';
import * as c from '@aws-accelerator/common-config/src';
import { AcmImportCertificate } from '@aws-accelerator/custom-resource-acm-import-certificate';
import { AccountStacks } from '../../common/account-stacks';
import { pascalCase } from 'pascal-case';
import { createCertificateSecretName, CfnAcmOutput } from './outputs';

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

    new CfnAcmOutput(scope, `Cert${certificatePrettyName}Output`, {
      certificateName: certificate.name,
      certificateArn: resource.certificateArn,
    });
  }
}

function validationMethodFromConfig(validation: c.CertificateValidation): certificatemanager.ValidationMethod {
  if (validation === 'EMAIL') {
    return certificatemanager.ValidationMethod.EMAIL;
  }
  return certificatemanager.ValidationMethod.DNS;
}
