# KMS Grant

This is a custom resource to generate a KMS grant.

## Usage

    import { Grant } from '@aws-accelerator/custom-resource-kms-grant';

    const grant = new Grant(scope, `Grant`, {
      granteePrincipal: principal,
      key: kmsKey,
      operations: [GrantOperation.DECRYPT],
    });
