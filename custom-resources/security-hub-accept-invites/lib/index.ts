import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';

const resourceType = 'Custom::SecurityHubAcceptInvites';

export interface SecurityHubAcceptInvitesProps {
  masterAccountId: string;
}

/**
 * Custom resource that has an image ID attribute for the image with the given properties.
 */
export class SecurityHubAcceptInvites extends cdk.Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: SecurityHubAcceptInvitesProps) {
    super(scope, id);

    const lambdaPath = require.resolve('@custom-resources/security-hub-accept-invites-lambda');
    const lambdaDir = path.dirname(lambdaPath);

    const provider = cdk.CustomResourceProvider.getOrCreate(this, resourceType, {
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_12,
      codeDirectory: lambdaDir,
      policyStatements: [
        new iam.PolicyStatement({
          actions: ['securityhub:*'],
          resources: ['*'],
        }).toJSON(),
      ],
    });

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: provider,
      properties: {
        masterAccountId: props.masterAccountId,
      },
    });
  }
}
