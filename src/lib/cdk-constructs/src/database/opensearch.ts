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

import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as opensearch from '@aws-cdk/aws-opensearchservice';
import { LogGroup } from '@aws-accelerator/custom-resource-logs-log-group';
import { LogResourcePolicy } from '@aws-accelerator/custom-resource-logs-resource-policy';
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';

export interface OpenSearchDomainConfigurationProps {
  acceleratorPrefix: string;
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
  logGroupLambdaRoleArn: string;
  cognitoUserPoolId: string;
  cognitoIdentityPoolId: string;
  cognitoPermissionRoleForOpenSearchArn: string;
}

export class OpenSearchDomain extends cdk.Construct {
  private readonly resource: opensearch.CfnDomain;

  constructor(scope: cdk.Construct, id: string, private readonly props: OpenSearchDomainConfigurationProps) {
    super(scope, id);

    const {
      acceleratorPrefix,
      domainName,
      subnetIds,
      securityGroupIds,
      mainNodeCount,
      dataNodeCount,
      mainNodeInstanceType,
      dataNodeInstanceType,
      volumeSize,
      adminRoleArn,
      logGroupLambdaRoleArn,
      encryptionKeyId,
      cognitoUserPoolId,
      cognitoIdentityPoolId,
      cognitoPermissionRoleForOpenSearchArn,
    } = props;

    const acceleratorPrefixNoDash = acceleratorPrefix.slice(0, -1);

    const cwLogGroupApplicationLogs = new LogGroup(this, `OpenSearchApplicationLogGroup`, {
      logGroupName: `/${acceleratorPrefixNoDash}/${domainName}/opensearch-application-logs`,
      roleArn: logGroupLambdaRoleArn,
    });

    const cwLogGroupSlowLogs = new LogGroup(this, `OpenSearchSlowLogGroup`, {
      logGroupName: `/${acceleratorPrefixNoDash}/${domainName}/opensearch-slow-logs`,
      roleArn: logGroupLambdaRoleArn,
    });

    const cwLogGroupIndexSlowLogs = new LogGroup(this, `OpenSearchIndexSlowLogGroup`, {
      logGroupName: `/${acceleratorPrefixNoDash}/${domainName}/opensearch-index-slow-logs`,
      roleArn: logGroupLambdaRoleArn,
    });

    const cwLogGroupAuditLogs = new LogGroup(this, `OpenSearchAuditLogGroup`, {
      logGroupName: `/${acceleratorPrefixNoDash}/${domainName}/opensearch-audit-logs`,
      roleArn: logGroupLambdaRoleArn,
    });

    // Allow elasticsearch to write to the log group
    const logPolicy = new LogResourcePolicy(this, 'OpenSearchLogGroupPolicy', {
      policyName: createName({
        name: 'opensearch-logging',
      }),
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
      engineVersion: 'OpenSearch_1.0',
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

    this.resource.cfnOptions.deletionPolicy = cdk.CfnDeletionPolicy.DELETE;

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
