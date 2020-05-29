import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
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
  private resource: cdk.CustomResource | undefined;

  constructor(scope: cdk.Construct, id: string, props: KeypairProps) {
    super(scope, id);

    this.props = props;
    this.tags.setTag('Name', props.name);
  }

  get keyName(): string {
    // Return a lazy value as the resource only gets created in the onPrepare phase
    return cdk.Lazy.stringValue({
      produce: () => this.resource!.getAttString('KeyName'),
    });
  }

  get arn(): string {
    return cdk.Lazy.stringValue({
      produce: () => this.resource!.getAttString('ARN'),
    });
  }

  get role(): iam.IRole {
    return this.lambdaFunction.role!;
  }

  protected onPrepare() {
    const handlerProperties: HandlerProperties = {
      keyName: this.props.name,
    };

    // Create the resource in the onPrepare phase to make the renderTags() work properly
    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: handlerProperties,
    });
  }

  private get lambdaFunction(): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@custom-resources/ec2-keypair');
    const lambdaDir = path.dirname(lambdaPath);

    const role = new iam.Role(stack, 'Role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'secretsmanager:createSecret',
          'secretsmanager:deleteSecret',
          'ec2:createKeyPair',
          'kms:Decrypt',
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'tag:GetResources',
        ],
        resources: ['*'],
      }),
    );

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
      timeout: cdk.Duration.seconds(10),
    });
  }
}
