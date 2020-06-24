import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import { HandlerProperties } from '@custom-resources/ec2-keypair-lambda';

const resourceType = 'Custom::EC2Keypair';

export interface KeypairProps {
  name: string;
  secretPrefix: string;
  roleName?: string;
}

export class Keypair extends cdk.Construct implements cdk.ITaggable {
  tags: cdk.TagManager = new cdk.TagManager(cdk.TagType.KEY_VALUE, 'Keypair');

  private resource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, private readonly props: KeypairProps) {
    super(scope, id);

    this.tags.setTag('Name', props.name);

    const handlerProperties: HandlerProperties = {
      keyName: this.props.name,
      secretPrefix: this.props.secretPrefix,
    };

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: handlerProperties,
    });
  }

  get keyName(): string {
    return this.resource.getAttString('KeyName');
  }

  get role(): iam.IRole {
    return this.lambdaFunction.role!;
  }

  private get lambdaFunction(): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@custom-resources/ec2-keypair-lambda');
    const lambdaDir = path.dirname(lambdaPath);

    const role = new iam.Role(stack, `${resourceType}Role`, {
      roleName: this.props.roleName,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['cur:*', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );
    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['ec2:CreateKeyPair', 'ec2:DeleteKeyPair'],
        resources: ['*'],
      }),
    );
    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'secretsmanager:CreateSecret',
          'secretsmanager:RestoreSecret',
          'secretsmanager:PutSecretValue',
          'secretsmanager:DeleteSecret',
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
