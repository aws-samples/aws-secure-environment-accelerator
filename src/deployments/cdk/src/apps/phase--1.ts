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

import { PhaseInput } from './shared';
import * as globalRoles from '../deployments/iam';

/**
 * This is the main entry point to deploy phase -1.
 *
 * The following resources are deployed in phase -1:
 *   - Creating required roles for macie custom resources
 *   - Creating required roles for guardDuty custom resources
 *   - Creating required roles for securityHub custom resources
 *   - Creating required roles for IamCreateRole custom resource
 *   - Creating required roles for createSSMDocument custom resource
 *   - Creating required roles for createLogGroup custom resource
 *   - Creating required roles for CWLCentralLoggingSubscriptionFilterRole custom resource
 *   - Creating required roles for TransitGatewayCreatePeeringAttachment custom resource
 *   - Creating required roles for TransitGatewayAcceptPeeringAttachment custom resource
 *   - Creating required roles for createLogsMetricFilter custom resource
 *   - Creating required roles for SnsSubscriberLambda custom resource
 *   - Creating required role for SsmIncreaseThroughput custom resource
 *   - Creating required role for S3PutBucketReplication custom resource
 */
export async function deploy({ acceleratorConfig, accountStacks, accounts }: PhaseInput) {
  // creates roles for macie custom resources
  await globalRoles.createMacieRoles({
    accountStacks,
    config: acceleratorConfig,
  });

  // creates roles for guardDuty custom resources
  await globalRoles.createGuardDutyRoles({
    accountStacks,
    config: acceleratorConfig,
  });

  // creates roles for securityHub custom resources
  await globalRoles.createSecurityHubRoles({
    accountStacks,
    accounts,
  });

  // Creates roles for IamCreateRole custom resource
  await globalRoles.createIamRole({
    accountStacks,
    accounts,
  });

  // Creates roles for createSSMDocument custom resource
  await globalRoles.createSSMDocumentRoles({
    accountStacks,
    accounts,
    config: acceleratorConfig,
  });

  // Creates roles for createLogGroup custom resource
  await globalRoles.createLogGroupRole({
    accountStacks,
    accounts,
  });

  // Creates roles for createCwlSubscriptionFilter custom resource
  await globalRoles.createCwlAddSubscriptionFilterRoles({
    accountStacks,
    accounts,
    config: acceleratorConfig,
  });

  // Creates role for SnsSubscriberLambda function
  await globalRoles.createSnsSubscriberLambdaRole({
    accountStacks,
    accounts,
    config: acceleratorConfig,
  });

  // Creates roles for transit gateway create peering attachment custom resource
  await globalRoles.createTgwPeeringRoles({
    accountStacks,
    config: acceleratorConfig,
  });

  // Creates roles for transit gateway accept peering attachment custom resource
  await globalRoles.createTgwAcceptPeeringRoles({
    accountStacks,
    config: acceleratorConfig,
  });
  // Creates role for createLogsMetricFilter custom resource
  await globalRoles.createLogsMetricFilterRole({
    accountStacks,
    accounts,
  });

  // Creates role for Resource cleanup custom resource
  await globalRoles.createCleanupRoles({
    accountStacks,
    accounts,
    config: acceleratorConfig,
  });

  // Creates role for Resource cleanup custom resource
  await globalRoles.createCentralEndpointDeploymentRole({
    accountStacks,
    config: acceleratorConfig,
  });

  // Creates required role for SsmIncreaseThroughput custom resource
  await globalRoles.createSsmThroughputRole({
    accountStacks,
    accounts,
  });

  // Creates required role for SsmIncreaseThroughput custom resource
  await globalRoles.createEc2OperationsRoles({
    accountStacks,
    accounts,
  });

  // Creates required role for S3PutBucketReplication custom resource
  await globalRoles.createS3PutReplicationRole({
    accountStacks,
    accounts,
  });

  await globalRoles.createFmsCustomResourceRole({
    accountStacks,
    config: acceleratorConfig,
  });
}
