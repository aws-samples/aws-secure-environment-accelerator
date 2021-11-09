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

import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

const ec2 = new AWS.EC2();

export const handler = async (event: CloudFormationCustomResourceEvent): Promise<unknown> => {
  console.log(`Deleting rules of Default security Group...`);
  console.log(JSON.stringify(event, null, 2));

  // eslint-disable-next-line default-case
  switch (event.RequestType) {
    case 'Create':
      return onCreate(event);
    case 'Update':
      return onUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
};

async function onCreate(event: CloudFormationCustomResourceEvent) {
  // Find default security group that match the given vpc id
  const defaultSecurityGroups = await throttlingBackOff(() =>
    ec2
      .describeSecurityGroups(
        buildDescribeSecurityGroupsRequest({
          vpcId: event.ResourceProperties.vpcId,
        }),
      )
      .promise(),
  );

  const defaultSecurityGroup = defaultSecurityGroups.SecurityGroups?.[0];
  const groupId = defaultSecurityGroup?.GroupId;
  const securityGroupIngress = defaultSecurityGroup?.IpPermissions;
  const securityGroupEgress = defaultSecurityGroup?.IpPermissionsEgress;
  const tags = defaultSecurityGroup?.Tags;

  if (groupId) {
    if (securityGroupIngress && securityGroupIngress.length > 0) {
      // Deleting VPC default security group inbound rule
      await throttlingBackOff(() => ec2.revokeSecurityGroupIngress(buildDeleteIngressRequest({ groupId })).promise());
    }

    if (securityGroupEgress && securityGroupEgress.length > 0) {
      // Deleting VPC default security group outbound rule
      await throttlingBackOff(() => ec2.revokeSecurityGroupEgress(buildDeleteEgressRequest({ groupId })).promise());
    }

    if (tags && tags.length === 0) {
      // Attaching tags to the VPC default security group
      await throttlingBackOff(() =>
        ec2
          .createTags(
            buildCreateTagsRequest({
              groupId,
              acceleratorName: event.ResourceProperties.acceleratorName,
            }),
          )
          .promise(),
      );
    }
  }
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}

/**
 * Auxiliary method to build a DescribeSecurityGroupsRequest from the given parameters.
 */
function buildDescribeSecurityGroupsRequest(props: { vpcId: string }): AWS.EC2.DescribeSecurityGroupsRequest {
  const { vpcId } = props;

  return {
    Filters: [
      {
        Name: 'vpc-id',
        Values: [vpcId],
      },
      {
        Name: 'group-name',
        Values: ['default'],
      },
    ],
  };
}

/**
 * Auxiliary method to build a RevokeSecurityGroupIngressRequest from the given parameters.
 */
function buildDeleteIngressRequest(props: { groupId: string }): AWS.EC2.RevokeSecurityGroupIngressRequest {
  const { groupId } = props;

  return {
    GroupId: groupId,
    IpPermissions: [
      {
        IpProtocol: '-1',
        FromPort: -1,
        ToPort: -1,
        UserIdGroupPairs: [
          {
            GroupId: groupId,
          },
        ],
      },
    ],
  };
}

/**
 * Auxiliary method to build a RevokeSecurityGroupEgressRequest from the given parameters.
 */
function buildDeleteEgressRequest(props: { groupId: string }): AWS.EC2.RevokeSecurityGroupEgressRequest {
  const { groupId } = props;
  return {
    GroupId: groupId,
    IpPermissions: [
      {
        IpProtocol: '-1',
        IpRanges: [
          {
            CidrIp: '0.0.0.0/0',
          },
        ],
      },
    ],
  };
}

/**
 * Auxiliary method to build a CreateTagsRequest from the given parameters.
 */
function buildCreateTagsRequest(props: { groupId: string; acceleratorName: string }): AWS.EC2.CreateTagsRequest {
  const { groupId, acceleratorName } = props;
  return {
    Resources: [groupId],
    Tags: [
      {
        Key: 'Name',
        Value: 'default',
      },
      {
        Key: 'Accel-P',
        Value: acceleratorName,
      },
    ],
  };
}
