import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import { HandlerProperties } from '@custom-resources/ec2-keypair-lambda';

const resourceType = 'Custom::EC2Keypair';

export interface KeypairProps {
  name: string;
  secretPrefix: string;
}

/**
 * Custom resource implementation that creates log subscription for directory service.
 */
export class Keypair extends cdk.Construct implements cdk.ITaggable {
  tags: cdk.TagManager = new cdk.TagManager(cdk.TagType.KEY_VALUE, 'Keypair');

  private readonly props: KeypairProps;
  private resource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: KeypairProps) {
    super(scope, id);

    this.props = props;
    this.tags.setTag('Name', props.name);

    const lambdaPath = require.resolve('@custom-resources/ec2-keypair-lambda');
    const lambdaDir = path.dirname(lambdaPath);

    const provider = cdk.CustomResourceProvider.getOrCreate(this, resourceType, {
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_12,
      codeDirectory: lambdaDir,
      policyStatements: [
        new iam.PolicyStatement({
          actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: ['*'],
        }).toJSON(),
        new iam.PolicyStatement({
          actions: ['ec2:createKeyPair'],
          resources: ['*'],
        }).toJSON(),
        new iam.PolicyStatement({
          actions: ['secretsmanager:createSecret','secretsmanager:deleteSecret'],
          resources: ['*'],
        }).toJSON(),
      ],
    });

    const handlerProperties: HandlerProperties = {
      keyName: this.props.name,
      secretPrefix: this.props.secretPrefix,
    };

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: provider,
      properties: handlerProperties,
    });
  }

  get keyName(): string {
    // Return a lazy value as the resource only gets created in the onPrepare phase
    return cdk.Lazy.stringValue({
      produce: () => this.resource.getAttString('KeyName'),
    });
  }

  get arn(): string {
    return cdk.Lazy.stringValue({
      produce: () => this.resource.getAttString('ARN'),
    });
  }
}
