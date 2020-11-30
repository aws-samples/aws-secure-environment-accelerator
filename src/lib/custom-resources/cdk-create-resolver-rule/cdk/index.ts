import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';

const resourceType = 'Custom::CreateResolverRule';

export interface TargetIp {
  Ip: string;
  Port: number;
}

export interface CreateResolverRuleProps {
  vpcId: string;
  domainName: string;
  targetIps: TargetIp[];
  resolverEndpointId: string;
  name: string;
  roleArn: string;
}

export interface CreateResolverRuleRuntimeProps extends Omit<CreateResolverRuleProps, 'roleArn'> {}
/**
 * Custom resource that will create Resolver Rule.
 */
export class CreateResolverRule extends cdk.Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: CreateResolverRuleProps) {
    super(scope, id);

    const runtimeProps: CreateResolverRuleRuntimeProps = props;
    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction(props.roleArn).functionArn,
      properties: {
        ...runtimeProps,
      },
    });
  }

  get ruleId(): string {
    return this.resource.getAttString('RuleId');
  }

  private lambdaFunction(roleArn: string): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-create-resolver-rule-runtime');
    const lambdaDir = path.dirname(lambdaPath);
    const role = iam.Role.fromRoleArn(stack, `${resourceType}Role`, roleArn);

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
      timeout: cdk.Duration.minutes(15),
    });
  }
}
