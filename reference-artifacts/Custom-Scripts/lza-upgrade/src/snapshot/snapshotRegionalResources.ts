/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { AwsCredentialIdentity } from '@aws-sdk/types';

import { TableOperations } from './common/dynamodb';
import { describeCertificates } from './lib/aws-acm';
import { describeCloudTrail, getCloudTrailEventSelectors, getCloudTrailInsightSelectors } from './lib/aws-cloudtrail';
import { describeAlarms, snapshotCloudWatchLogResources } from './lib/aws-cloudwatch';
import {
  getEbsEncryptionEnabled,
  getEbsEncryptionKmsKey,
  describeTransitGatewayAttachments,
  describeTransitGatewayPeeringAttachments,
  describeKeyPairs,
  snapshotVpcResources,
  snapshotVpcEndpoints,
  snapshotVpcEndpointServices,
} from './lib/aws-ec2';
import { snapshotKmsKeys } from './lib/aws-kms';
import { getMacieExportConfig, getMacieStatus } from './lib/aws-macie';
import { snapshotHostedZones } from './lib/aws-route53';
import { getRoute53ResolverRules, getRoute53ResolverRuleAssociations } from './lib/aws-route53-resolver';
import {
  getSecurityHubDisabledControls,
  getSecurityHubFindingAggregators,
  getSecurityHubStandardsSubscriptions,
  getSecurityHubStatus,
} from './lib/aws-securityhub';
import { describeSessionManagerDocument, describeSsmDocuments, describeSsmDocumentPermissions } from './lib/aws-ssm';


export async function snapshotRegionResources(
  tableName: string,
  homeRegion: string,
  prefix: string,
  accountId: string,
  region: string,
  preMigration: boolean,
  credentials: AwsCredentialIdentity | undefined,
) {
  console.log(`######## Starting snapshot Region resources for  Account: ${accountId} and Region ${region} ###########`)
  const snapshotTable = new TableOperations(tableName, homeRegion);

  console.log(`^^^^^^^ Starting table operations for  Account: ${accountId} and Region ${region} ^^^^^^^`)
  // cloudwatch alarms
  const alarmResults = await describeAlarms(prefix, region, credentials);
  console.log(`@@@@@@@@ Starting describe Alarms for resources for  Account: ${accountId} and Region ${region} @@@@@@@@@@`)
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'cloudwatch-alarms',
    preMigration: preMigration,
    data: alarmResults,
  });

  // ebs encryption enabled
  const ebsEncryptionEnabledResults = await getEbsEncryptionEnabled(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'ebs-encryption',
    preMigration: preMigration,
    data: ebsEncryptionEnabledResults,
  });

  // ebs encryption kms key
  const ebsEncryptionKmsKeyResults = await getEbsEncryptionKmsKey(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'ebs-encryption-kms-key',
    preMigration: preMigration,
    data: ebsEncryptionKmsKeyResults,
  });

  // session manager document
  const describeSessionManagerDocumentResults = await describeSessionManagerDocument(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'session-manager-document',
    preMigration: preMigration,
    data: describeSessionManagerDocumentResults,
  });

  // ssm documents
  const describeSsmDocumentsResults = await describeSsmDocuments(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'ssm-documents',
    preMigration: preMigration,
    data: describeSsmDocumentsResults,
  });

  // ssm document permissions
  const describeSsmDocumentPermissionResults = await describeSsmDocumentPermissions(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'ssm-document-permissions',
    preMigration: preMigration,
    data: describeSsmDocumentPermissionResults,
  });

  if (region !== 'ca-west-1') {
    // macie status
    const macieStatusResults = await getMacieStatus(region, credentials);
    await snapshotTable.writeResource({
      accountId: accountId,
      region: region,
      resourceName: 'macie-status',
      preMigration: preMigration,
      data: macieStatusResults,
    });

    // macie export config
    const macieExportConfigResults = await getMacieExportConfig(region, credentials);
    await snapshotTable.writeResource({
      accountId: accountId,
      region: region,
      resourceName: 'macie-export-config',
      preMigration: preMigration,
      data: macieExportConfigResults,
    });
  }

  // securityhub status
  const securityHubStatusResults = await getSecurityHubStatus(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'securityhub-status',
    preMigration: preMigration,
    data: securityHubStatusResults,
  });

  // securityhub standards
  const securityHubStandardsResults = await getSecurityHubStandardsSubscriptions(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'securityhub-standards',
    preMigration: preMigration,
    data: securityHubStandardsResults,
  });

  // securityhub disabled controls
  const securityHubDisabledControlsResults = await getSecurityHubDisabledControls(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'securityhub-disabled-controls',
    preMigration: preMigration,
    data: securityHubDisabledControlsResults,
  });

  // securityhub finding aggregators
  const securityFindingAggregatorResults = await getSecurityHubFindingAggregators(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'securityhub-finding-aggregators',
    preMigration: preMigration,
    data: securityFindingAggregatorResults,
  });

  // acm certificates
  const acmCertificateResults = await describeCertificates(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'acm-certificates',
    preMigration: preMigration,
    data: acmCertificateResults,
  });

  // transit gateway attachments
  const transitGatewayResults = await describeTransitGatewayAttachments(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'transit-gateway-attachments',
    preMigration: preMigration,
    data: transitGatewayResults,
  });

  // transit gateway attachments
  const transitGatewayPeeringResults = await describeTransitGatewayPeeringAttachments(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'transit-gateway-peering-attachments',
    preMigration: preMigration,
    data: transitGatewayPeeringResults,
  });

  // cloudtrail
  const cloudtrailResults = await describeCloudTrail(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'cloudtrail',
    preMigration: preMigration,
    data: cloudtrailResults,
  });

  // cloudtrail insight selectors
  const cloudtrailInsightResults = await getCloudTrailInsightSelectors(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'cloudtrail-insight-selectors',
    preMigration: preMigration,
    data: cloudtrailInsightResults,
  });

  // cloudtrail event selectors
  const cloudtrailEventResults = await getCloudTrailEventSelectors(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'cloudtrail-event-selectors',
    preMigration: preMigration,
    data: cloudtrailEventResults,
  });

  // route53 resolver rules
  const route53ResolverRuleResults = await getRoute53ResolverRules(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'route53-resolver-rules',
    preMigration: preMigration,
    data: route53ResolverRuleResults,
  });

  // route53 resolver rule associations
  const route53ResolverRuleAssociationResults = await getRoute53ResolverRuleAssociations(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'route53-resolver-rule-associations',
    preMigration: preMigration,
    data: route53ResolverRuleAssociationResults,
  });

  // ec2 key pairs
  const ec2KeyPairResults = await describeKeyPairs(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'ec2-key-pairs',
    preMigration: preMigration,
    data: ec2KeyPairResults,
  });

  await snapshotHostedZones(tableName, homeRegion, accountId, region, preMigration, credentials);
  await snapshotVpcEndpoints(tableName, homeRegion, accountId, region, preMigration, credentials);
  await snapshotVpcEndpointServices(tableName, homeRegion, accountId, region, preMigration, credentials);
  await snapshotVpcResources(tableName, homeRegion, accountId, region, preMigration, credentials);
  await snapshotCloudWatchLogResources(tableName, homeRegion, accountId, region, preMigration, credentials);
  await snapshotKmsKeys(tableName, homeRegion, accountId, region, preMigration, credentials);
}
