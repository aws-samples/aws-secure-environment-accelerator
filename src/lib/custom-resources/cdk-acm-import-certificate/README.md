# ACM Import Certificate

This is a custom resource to import a certificate into AWS Certificate Manager.

## Usage

    import { AcmImportCertificate } from '@aws-accelerator/custom-resource-acm-import-certificate';

    new AcmImportCertificate(scope, `Certificate`, {
      name: 'MyCertificate',
      certificateBucket: ...,
      certificateBucketPath: ...,
      privateKeyBucket: ...,
      privateKeyBucketPath: ...,
      certificateChainBucket: ...,
      certificateChainBucketPath: ...,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
