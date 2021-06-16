import * as ddb from '@aws-cdk/aws-dynamodb';
import { Rule, Schedule } from '@aws-cdk/aws-events';
import * as targets from '@aws-cdk/aws-events-targets';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import { DynamoEventSource } from '@aws-cdk/aws-lambda-event-sources';
import { Construct, RemovalPolicy, Duration } from '@aws-cdk/core';
import path from 'path';

export class AlbIpForwarding extends Construct {
  constructor(scope: Construct, id: string, props = {}) {
    super(scope, id);

    const ddbTable = new ddb.Table(this, 'ddbDNSFirewallTable', {
      partitionKey: { name: 'id', type: ddb.AttributeType.STRING },
      stream: ddb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const tableEventSource = new DynamoEventSource(ddbTable, {
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      retryAttempts: 0,
    });

    const lambdaPath = require.resolve('@aws-accelerator/deployments-runtime');
    const lambdaDir = path.dirname(lambdaPath);
    const lambdaCode = lambda.Code.fromAsset(lambdaDir);

    const dnsFWLambda = new lambda.Function(this, `dnsFWLambda`, {
      // Inline code is only allowed for Node.js version 12
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambdaCode,
      handler: 'index.albIpMonitor',
      timeout: Duration.seconds(30),
      environment: {
        LOOKUP_TABLE: ddbTable.tableName,
      },
    });

    ddbTable.grantReadWriteData(dnsFWLambda);

    dnsFWLambda.role?.attachInlinePolicy(
      new iam.Policy(this, 'nfwstatement1', {
        statements: [
          new iam.PolicyStatement({
            resources: ['*'],
            actions: ['elasticloadbalancing:RegisterTargets', 'elasticloadbalancing:DeregisterTargets'],
          }),
        ],
      }),
    );

    const lambdaDnsRecordMonitor = new lambda.Function(this, 'ddbDnsRecordMonitor', {
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: 'index.albTargetRecordMonitor',
      code: lambdaCode,
      timeout: Duration.seconds(30),
      environment: {
        LOOKUP_TABLE: ddbTable.tableName,
      },
    });

    ddbTable.grantReadWriteData(lambdaDnsRecordMonitor);
    lambdaDnsRecordMonitor.addEventSource(tableEventSource);
    lambdaDnsRecordMonitor.role?.attachInlinePolicy(
      new iam.Policy(this, 'nfwstatement2', {
        statements: [
          new iam.PolicyStatement({
            resources: ['*'],
            actions: [
              'elasticloadbalancing:CreateTargetGroup',
              'elasticloadbalancing:CreateRule',
              'elasticloadbalancing:ModifyRule',
              'elasticloadbalancing:ModifyTargetGroup',
              'elasticloadbalancing:DeleteTargetGroup',
              'elasticloadbalancing:DeleteRule',
            ],
          }),
        ],
      }),
    );
    const cloudwatchrule = new Rule(this, 'cwrule', {
      schedule: Schedule.rate(Duration.minutes(1)),
    });

    cloudwatchrule.addTarget(new targets.LambdaFunction(dnsFWLambda));
  }
}
