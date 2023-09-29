/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as ddb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { RemovalPolicy, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import path from 'path';

export interface AlbIpProps {
  vpcId: string;
  ddbKmsKey: string | undefined;
  acceleratorPrefix: string;
}

export class AlbIpForwarding extends Construct {
  constructor(scope: Construct, id: string, albIpProps: AlbIpProps) {
    super(scope, id);
    const prefix = albIpProps.acceleratorPrefix;
    let kmsKey;
    if (albIpProps.ddbKmsKey) {
      kmsKey = kms.Key.fromKeyArn(this, 'ddbImportKey', albIpProps.ddbKmsKey);
    }
    const ddbTable = new ddb.Table(this, `${prefix}ddbDNSFirewallTable`, {
      partitionKey: { name: 'id', type: ddb.AttributeType.STRING },
      stream: ddb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: RemovalPolicy.DESTROY,
      tableName: `${prefix}Alb-Ip-Forwarding-${albIpProps.vpcId}`,
      encryption: ddb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: kmsKey,
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
    });
    const tableEventSource = new DynamoEventSource(ddbTable, {
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      retryAttempts: 0,
    });

    const lambdaPath = require.resolve('@aws-accelerator/deployments-runtime');
    const lambdaDir = path.dirname(lambdaPath);
    const lambdaCode = lambda.Code.fromAsset(lambdaDir);

    const dnsFWLambda = new lambda.Function(this, `${prefix}dnsFWLambda`, {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambdaCode,
      handler: 'index.albIpMonitor',
      timeout: Duration.seconds(60),
      environment: {
        LOOKUP_TABLE: ddbTable.tableName,
      },
    });

    ddbTable.grantReadWriteData(dnsFWLambda);

    dnsFWLambda.role?.attachInlinePolicy(
      new iam.Policy(this, `${prefix}nfwstatement1`, {
        statements: [
          new iam.PolicyStatement({
            resources: ['*'],
            actions: ['elasticloadbalancing:RegisterTargets', 'elasticloadbalancing:DeregisterTargets'],
          }),
        ],
      }),
    );

    const lambdaDnsRecordMonitor = new lambda.Function(this, `${prefix}ddbDnsRecordMonitor`, {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.albTargetRecordMonitor',
      code: lambdaCode,
      timeout: Duration.seconds(60),
      environment: {
        LOOKUP_TABLE: ddbTable.tableName,
      },
    });

    ddbTable.grantReadWriteData(lambdaDnsRecordMonitor);
    lambdaDnsRecordMonitor.addEventSource(tableEventSource);
    lambdaDnsRecordMonitor.role?.attachInlinePolicy(
      new iam.Policy(this, `${prefix}nfwstatement2`, {
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
              'elasticloadbalancing:DescribeListeners',
              'elasticloadbalancing:DescribeRules',
              'elasticloadbalancing:SetRulePriorities',
              'elasticloadbalancing:ModifyTargetGroupAttributes',
            ],
          }),
        ],
      }),
    );
    const cloudwatchrule = new Rule(this, `${prefix}cwrule`, {
      schedule: Schedule.rate(Duration.minutes(1)),
    });

    cloudwatchrule.addTarget(new targets.LambdaFunction(dnsFWLambda));
  }
}
