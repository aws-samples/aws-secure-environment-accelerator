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
import * as elb from '@aws-cdk/aws-elasticloadbalancingv2';
import { ElbDeletionProtection } from '@aws-accelerator/custom-resource-elb-deletion-protection';
import * as s3 from '@aws-cdk/aws-s3';

export interface NetworkLoadBalancerProps extends cdk.StackProps {
  nlbName: string;
  scheme: string;
  subnetIds: string[];
  ipType: string;
  aesLogArchiveBucket: s3.IBucket;
}

export class NetworkLoadBalancer extends cdk.Construct {
  private readonly resource: elb.CfnLoadBalancer;
  private readonly listeners: elb.CfnListener[] = [];

  constructor(scope: cdk.Construct, id: string, private readonly props: NetworkLoadBalancerProps) {
    super(scope, id);

    const { nlbName, scheme, subnetIds, ipType, aesLogArchiveBucket } = props;

    this.resource = new elb.CfnLoadBalancer(this, `Nlb${nlbName}`, {
      name: nlbName,
      ipAddressType: ipType,
      scheme,
      subnets: subnetIds,
      type: 'network',
      loadBalancerAttributes: [
        {
          key: 'access_logs.s3.enabled',
          value: 'true',
        },
        {
          key: 'access_logs.s3.bucket',
          value: aesLogArchiveBucket.bucketName,
        },
        {
          key: 'access_logs.s3.prefix',
          value: `${cdk.Aws.ACCOUNT_ID}/elb-${nlbName}`,
        },
      ],
    });

    new ElbDeletionProtection(this, `Nlb${nlbName}DeletionProtection`, {
      loadBalancerArn: this.resource.ref,
      loadBalancerName: nlbName,
    });
  }

  addListener(props: { ports: number; protocol: string; actionType: string; targetGroupArns: string[] }) {
    const { ports, protocol, actionType, targetGroupArns } = props;
    const targetGroups = targetGroupArns.map(arn => ({
      targetGroupArn: arn,
    }));
    const listener = new elb.CfnListener(this, `Listener${this.listeners.length}`, {
      port: ports,
      loadBalancerArn: this.resource.ref,
      protocol,
      defaultActions: [
        {
          type: actionType,
          forwardConfig: {
            targetGroups,
          },
        },
      ],
    });
    this.listeners.push(listener);
  }

  get name(): string {
    return this.resource.name!;
  }

  get dns(): string {
    return this.resource.attrDnsName;
  }

  get hostedZoneId(): string {
    return this.resource.attrCanonicalHostedZoneId;
  }

  get arn(): string {
    return this.resource.ref;
  }
}
