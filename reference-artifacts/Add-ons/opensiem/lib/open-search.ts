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
import { RemovalPolicy, CfnDeletionPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { LogResourcePolicy } from './log-group-resource-policy';

export interface OpenSearchDomainConfigurationProps {
  domainName: string;
  subnetIds: string[];
  securityGroupIds: string[];
  mainNodeCount: number;
  dataNodeCount: number;
  mainNodeInstanceType: string;
  dataNodeInstanceType: string;
  volumeSize: number;
  encryptionKeyId: string;
  adminRoleArn: string;
  cognitoUserPoolId: string;
  cognitoIdentityPoolId: string;
  cognitoPermissionRoleForOpenSearchArn: string;
}

export class OpenSearchDomain extends Construct {
  private readonly resource: opensearch.CfnDomain;

  constructor(scope: Construct, id: string, private readonly props: OpenSearchDomainConfigurationProps) {
    super(scope, id);

    const {
      domainName,
      subnetIds,
      securityGroupIds,
      mainNodeCount,
      dataNodeCount,
      mainNodeInstanceType,
      dataNodeInstanceType,
      volumeSize,
      adminRoleArn,
      encryptionKeyId,
      cognitoUserPoolId,
      cognitoIdentityPoolId,
      cognitoPermissionRoleForOpenSearchArn,
    } = props;

    // Log Groups
    const cwLogGroupApplicationLogs = new logs.LogGroup(this, `ApplicationLogGroup`, {
      logGroupName: `/${domainName}/opensearch-application-logs`,
      removalPolicy: RemovalPolicy.RETAIN,
      retention: logs.RetentionDays.INFINITE,
    });

    const cwLogGroupSlowLogs = new logs.LogGroup(this, `SlowLogGroup`, {
      logGroupName: `/${domainName}/opensearch-slow-logs`,
      removalPolicy: RemovalPolicy.RETAIN,
      retention: logs.RetentionDays.INFINITE,
    });

    const cwLogGroupIndexSlowLogs = new logs.LogGroup(this, `IndexSlowLogGroup`, {
      logGroupName: `/${domainName}/opensearch-index-slow-logs`,
      removalPolicy: RemovalPolicy.RETAIN,
      retention: logs.RetentionDays.INFINITE,
    });

    const cwLogGroupAuditLogs = new logs.LogGroup(this, `AuditLogGroup`, {
      logGroupName: `/${domainName}/opensearch-audit-logs`,
      removalPolicy: RemovalPolicy.RETAIN,
      retention: logs.RetentionDays.INFINITE,
    });

    // Allow elasticsearch to write to the log group
    const logPolicy = new LogResourcePolicy(this, 'LogGroupPolicy', {
      policyName: `opensearch-logging`,
      policyStatements: [
        new iam.PolicyStatement({
          actions: ['logs:CreateLogStream', 'logs:PutLogEvents', 'logs:PutLogEventsBatch'],
          principals: [new iam.ServicePrincipal('es.amazonaws.com')],
          resources: [
            cwLogGroupApplicationLogs.logGroupArn,
            cwLogGroupSlowLogs.logGroupArn,
            cwLogGroupIndexSlowLogs.logGroupArn,
            cwLogGroupAuditLogs.logGroupArn,
          ],
        }),
      ],
    });

    this.resource = new opensearch.CfnDomain(this, 'Domain', {
      engineVersion: 'OpenSearch_1.1',
      domainName,
      clusterConfig: {
        dedicatedMasterEnabled: true,
        dedicatedMasterCount: mainNodeCount,
        dedicatedMasterType: mainNodeInstanceType,
        instanceCount: dataNodeCount,
        instanceType: dataNodeInstanceType,
        zoneAwarenessEnabled: true,
      },
      cognitoOptions: {
        enabled: true,
        identityPoolId: cognitoIdentityPoolId,
        userPoolId: cognitoUserPoolId,
        roleArn: cognitoPermissionRoleForOpenSearchArn,
      },
      ebsOptions: {
        ebsEnabled: true,
        volumeSize,
        volumeType: 'gp2',
      },
      advancedSecurityOptions: {
        internalUserDatabaseEnabled: false,
        enabled: true,
        masterUserOptions: {
          masterUserArn: adminRoleArn,
        },
      },
      domainEndpointOptions: {
        enforceHttps: true,
        tlsSecurityPolicy: opensearch.TLSSecurityPolicy.TLS_1_2,
      },
      encryptionAtRestOptions: {
        enabled: true,
        kmsKeyId: encryptionKeyId,
      },
      nodeToNodeEncryptionOptions: {
        enabled: true,
      },
      snapshotOptions: {
        automatedSnapshotStartHour: 0,
      },
      vpcOptions: {
        subnetIds,
        securityGroupIds,
      },
      logPublishingOptions: {
        ES_APPLICATION_LOGS: {
          enabled: true,
          cloudWatchLogsLogGroupArn: cwLogGroupApplicationLogs.logGroupArn,
        },
        SEARCH_SLOW_LOGS: {
          enabled: true,
          cloudWatchLogsLogGroupArn: cwLogGroupSlowLogs.logGroupArn,
        },
        INDEX_SLOW_LOGS: {
          enabled: true,
          cloudWatchLogsLogGroupArn: cwLogGroupIndexSlowLogs.logGroupArn,
        },
        AUDIT_LOGS: {
          enabled: true,
          cloudWatchLogsLogGroupArn: cwLogGroupAuditLogs.logGroupArn,
        },
      },
    });

    this.resource.cfnOptions.deletionPolicy = CfnDeletionPolicy.DELETE;

    this.resource.node.addDependency(logPolicy);
  }

  get name(): string {
    return this.resource.ref;
  }

  get dns(): string {
    return this.resource.attrDomainEndpoint;
  }

  get arn(): string {
    return this.resource.attrArn;
  }
}
