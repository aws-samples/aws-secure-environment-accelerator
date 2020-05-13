import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as config from '@aws-cdk/aws-config';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';

export type MaximumExecutionFrequency = config.MaximumExecutionFrequency;

export interface ConfigRule {
  // tslint:disable-next-line: no-any
  renderToCloudFormation(): any;
}

export interface VpcConfigRuleExpectedFlowLogDestination {
  accountId: string,
  executionRoleName: string,
  vpcId: string,
  flowLogDestination: string,
}

export interface VpcConfigRuleProps {
  expectedVpcFlowLogDestinations: VpcConfigRuleExpectedFlowLogDestination[];
  // maximumExecutionFrequency?: MaximumExecutionFrequency;
}

/**
 * Custom resource that has an image ID attribute for the image with the given properties.
 */
export class VpcConfigRule extends cdk.Construct implements ConfigRule {
  private readonly props: VpcConfigRuleProps;

  constructor(scope: cdk.Construct, id: string, props: VpcConfigRuleProps) {
    super(scope, id);
    this.props = props;

    // const rule = new config.CustomRule(this, 'Resource', {
    //   lambdaFunction: this.ensureLambda(),
    //   configurationChanges: true,
    //   periodic: !!props.maximumExecutionFrequency,
    //   maximumExecutionFrequency: props.maximumExecutionFrequency,
    //   inputParameters: {
    //     expectedVpcFlowLogBucket: props.expectedVpcFlowLogBucket,
    //   },
    // });
    // rule.scopeToResource('AWS::EC2::Volume');
  }

  // tslint:disable-next-line: no-any
  renderToCloudFormation(): any {
    const lambdaFunc = this.ensureLambda();
    return {
      Type: 'AWS::Config::ConfigRule',
      Properties: {
        ConfigRuleName: 'VpcConfigRule',
        Description: 'Checks whether Amazon Virtual Private Cloud flow logs are found and enabled for Amazon VPC.',
        Scope: {
          ComplianceResourceTypes: ['AWS::EC2::VPC'],
        },
        Source: {
          Owner: 'CUSTOM_LAMBDA',
          SourceIdentifier: lambdaFunc.functionArn,
          SourceDetails: [
            {
              EventSource: 'aws.config',
              MessageType: 'ConfigurationItemChangeNotification',
            },
          ],
        },
        // InputParameters: JSON.stringify({
        //   expectedVpcFlowLogBucket: this.props.expectedVpcFlowLogBucket,
        // }),
      },
    };
  }

  private ensureLambda(): lambda.Function {
    const constructName = 'VpcConfigRuleLambda';

    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaRole = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Grant permissions to write logs
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );

    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ec2:DescribeFlowLogs'],
        resources: ['*'],
      }),
    );

    // node_modules/@config-rules/vpc-config-rule-lambda/dist/index.js
    const lambdaPath = require.resolve('@config-rules/vpc-config-rule-lambda');
    // node_modules/@config-rules/vpc-config-rule-lambda/dist
    const lambdaDir = path.dirname(lambdaPath);

    const lambdaFunction = new lambda.Function(this, 'Lambda', {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role: lambdaRole,
    });

    lambdaFunction.addPermission('ConfigRule', {
      principal: new iam.ServicePrincipal('config.amazonaws.com'),
      action: 'lambda:InvokeFunction',
    });

    return lambdaFunction;
  }
}
