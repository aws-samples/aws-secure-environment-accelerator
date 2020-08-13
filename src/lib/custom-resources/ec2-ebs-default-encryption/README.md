# EC2 EBS Default Encryption

This is a custom resource to enable default encryption for EBS.

## Usage

    import { EbsDefaultEncryption } from '@custom-resources/ec2-ebs-default-encryption';

    new EbsDefaultEncryption(scope, `EbsEncryption`, {
      key,
    });
