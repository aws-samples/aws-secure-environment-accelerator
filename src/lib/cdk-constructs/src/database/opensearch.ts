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
import * as opensearch from '@aws-cdk/aws-opensearchservice';


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
  adminRole: string;
  cognitoUserPoolId: string;
  cognitoIdentityPoolId: string;
  cognitoPermissionRoleForOpenSearchArn: string
}


export class OpenSearchDomain extends cdk.Construct {

  private readonly resource: opensearch.CfnDomain;

  constructor(scope: cdk.Construct, id: string, private readonly props: OpenSearchDomainConfigurationProps) {
    super(scope, id);

    const { domainName, subnetIds, securityGroupIds, mainNodeCount, dataNodeCount, mainNodeInstanceType, dataNodeInstanceType, volumeSize, adminRole, encryptionKeyId, cognitoUserPoolId, cognitoIdentityPoolId, cognitoPermissionRoleForOpenSearchArn } = props;
         
    this.resource = new opensearch.CfnDomain(this, 'Domain', {
      engineVersion: 'OpenSearch_1.0',
      domainName: domainName,
      clusterConfig: {
        dedicatedMasterEnabled: true,
        dedicatedMasterCount: mainNodeCount,
        dedicatedMasterType: mainNodeInstanceType,
        instanceCount: dataNodeCount,
        instanceType: dataNodeInstanceType,
        zoneAwarenessEnabled: true
      },
      cognitoOptions: {
        enabled: true,
        identityPoolId: cognitoIdentityPoolId,
        userPoolId: cognitoUserPoolId,
        roleArn: cognitoPermissionRoleForOpenSearchArn
      },
      ebsOptions: {
        ebsEnabled: true,
        volumeSize: volumeSize,
        volumeType: 'gp2'
      },
      advancedSecurityOptions: {
        internalUserDatabaseEnabled: false,
        enabled: true,
        masterUserOptions: {   
          masterUserArn: adminRole
        }
      },
      domainEndpointOptions: {
        enforceHttps: true,
        tlsSecurityPolicy: opensearch.TLSSecurityPolicy.TLS_1_2
      },
      encryptionAtRestOptions: {
        enabled: true,
        kmsKeyId: encryptionKeyId
      },
      nodeToNodeEncryptionOptions: {
        enabled: true
      },
      snapshotOptions: {
        automatedSnapshotStartHour: 0
      },
      vpcOptions: {
        subnetIds: subnetIds,
        securityGroupIds: securityGroupIds
      }
    });

  }

  get name(): string {
    return this.resource.ref!;
  }

  get dns(): string {
    return this.resource.attrDomainEndpoint;
  }

  get arn(): string {
    return this.resource.attrArn;
  }

}
