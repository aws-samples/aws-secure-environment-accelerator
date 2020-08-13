import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import { HandlerProperties } from '@custom-resources/logs-log-group-lambda';

const resourceType = 'Custom::LogsLogGroup';

export type LogGroupRetention =
  | 1
  | 3
  | 5
  | 7
  | 14
  | 30
  | 60
  | 90
  | 120
  | 150
  | 180
  | 365
  | 400
  | 545
  | 731
  | 1827
  | 3653;

export interface LogGroupProps {
  /**
   * Name of the log group.
   */
  readonly logGroupName: string;
  /**
   * How long, in days, the log contents will be retained.
   *
   * To retain all logs, set this value to undefined.
   *
   * @default undefined
   */
  readonly retention?: LogGroupRetention;
  /**
   * Determine the removal policy of this log group.
   *
   * Normally you want to retain the log group so you can diagnose issues
   * from logs even after a deployment that no longer includes the log group.
   * In that case, use the normal date-based retention policy to age out your
   * logs.
   *
   * @default RemovalPolicy.Retain
   */
  readonly removalPolicy?: cdk.RemovalPolicy;
  readonly roleName?: string;
  readonly roleArn: string;
}

export class LogGroup extends cdk.Construct implements cdk.ITaggable {
  tags: cdk.TagManager = new cdk.TagManager(cdk.TagType.MAP, 'LogGroup');

  private resource: cdk.CustomResource | undefined;
  private roleArn: string;

  constructor(scope: cdk.Construct, id: string, private readonly props: LogGroupProps) {
    super(scope, id);
    this.roleArn = props.roleArn;
  }

  protected onPrepare() {
    const handlerProperties: HandlerProperties = {
      logGroupName: this.props.logGroupName,
      retention: this.props?.retention,
      tags: this.tags.renderTags(),
    };

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: handlerProperties,
      removalPolicy: this.props.removalPolicy ?? cdk.RemovalPolicy.RETAIN,
    });
  }

  get logGroupName() {
    return cdk.Lazy.stringValue({
      produce: () => this.resource!.getAttString('LogGroupName'),
    });
  }

  get logGroupArn() {
    return `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:${this.logGroupName}:*`;
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

    const lambdaPath = require.resolve('@custom-resources/logs-log-group-lambda');
    const lambdaDir = path.dirname(lambdaPath);
    const role = iam.Role.fromRoleArn(stack, `${resourceType}Role`, this.roleArn);

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
      timeout: cdk.Duration.minutes(15),
    });
  }
}
