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

import * as nfw from '@aws-cdk/aws-networkfirewall';
import { Construct, Fn } from '@aws-cdk/core';
import { AzSubnet } from './vpc';
import * as defaults from '../deployments/defaults';
import * as logs from '@aws-cdk/aws-logs';
import { LogGroup } from '@aws-accelerator/custom-resource-logs-log-group';

export interface NfwProps {
  subnets: AzSubnet[];
  vpcId: string;
  nfwPolicyConfig: {
    name: string;
    path: string;
  };
  nfwPolicy: any;
  nfwName: string;
  acceleratorPrefix: string;
  nfwFlowLogging: 'S3' | 'CloudWatch' | 'None';
  nfwAlertLogging: 'S3' | 'CloudWatch' | 'None';
  nfwFlowCWLDestination?: string;
  logGroupRoleArn: string;
  logBucket?: defaults.RegionalBucket;
}

export interface NfwOutput {
  az: string;
  vpcEndpoint: string;
  subnets: {
    subnetId: string;
    subnetName: string;
    az: string;
    cidrBlock: string;
  }[];
}
export class Nfw extends Construct {
  private vpcId: string;
  private nfwPolicyConfig: any;
  private nfwPolicy: any;
  private nfwName: string;
  readonly firewall: nfw.CfnFirewall;
  readonly policy: nfw.CfnFirewallPolicy;
  readonly nfwOutput: NfwOutput[];
  constructor(scope: Construct, id: string, props: NfwProps) {
    super(scope, id);
    this.vpcId = props.vpcId;

    this.nfwPolicy = JSON.parse(props.nfwPolicy);
    this.nfwPolicyConfig = props.nfwPolicyConfig;
    this.nfwName = props.nfwName;

    const policy: any = {};
    const prefix = props.acceleratorPrefix;
    const acceleratorPrefixNoDash = props.acceleratorPrefix.slice(0, -1);
    const logGroupName = `/${prefix}/Nfw`;

    const cwFlowGroup = new LogGroup(this, `${this.nfwName}NFWCWLFlowLogging`, {
      logGroupName: `/${acceleratorPrefixNoDash}/Nfw/${this.nfwName}/Flow`,
      roleArn: props.logGroupRoleArn,
    });

    const cwAlertGroup = new LogGroup(this, `${this.nfwName}NFWCWLAlertLogging`, {
      logGroupName: `/${acceleratorPrefixNoDash}/Nfw/${this.nfwName}/Alert`,
      roleArn: props.logGroupRoleArn,
    });

    if (this.nfwPolicy.statelessRuleGroup) {
      const statelessRuleGroup: any[] = this.nfwPolicy.statelessRuleGroup.map((ruleGroup: any) => {
        ruleGroup.ruleGroupName = `${prefix}${this.nfwName}-${ruleGroup.ruleGroupName}`;
        return {
          group: new nfw.CfnRuleGroup(this, ruleGroup.ruleGroupName, ruleGroup),
          priority: ruleGroup.priority,
        };
      });
      policy.statelessRuleGroupReferences = statelessRuleGroup.map((ruleGroup: any) => {
        return { resourceArn: ruleGroup.group.ref, priority: ruleGroup.priority };
      });
    }
    if (this.nfwPolicy.statefulRuleGroup) {
      const statefulRuleGroup: nfw.CfnRuleGroup[] = this.nfwPolicy.statefulRuleGroup.map((ruleGroup: any) => {
        ruleGroup.ruleGroupName = `${prefix}${this.nfwName}-${ruleGroup.ruleGroupName}`;
        return new nfw.CfnRuleGroup(this, ruleGroup.ruleGroupName, ruleGroup);
      });
      policy.statefulRuleGroupReferences = statefulRuleGroup.map(ruleGroup => {
        return { resourceArn: ruleGroup.ref };
      });
    }

    policy.statelessFragmentDefaultActions = this.nfwPolicy.statelessFragmentDefaultActions;
    policy.statelessDefaultActions = this.nfwPolicy.statelessDefaultActions;
    const subnetIds = props.subnets.map(subnet => {
      return { subnetId: subnet.id };
    });

    this.policy = new nfw.CfnFirewallPolicy(this, `${this.nfwName}${this.nfwPolicyConfig.name}`, {
      firewallPolicyName: `${prefix}${this.nfwName}-${this.nfwPolicyConfig.name}`,
      firewallPolicy: policy,
    });
    this.firewall = new nfw.CfnFirewall(this, `${this.nfwName}NFW`, {
      firewallName: `${prefix}${this.nfwName}`,
      firewallPolicyArn: this.policy.ref,
      subnetMappings: subnetIds,
      vpcId: this.vpcId,
    });

    const subnetsOutput = props.subnets.map(s => ({
      subnetId: s.subnet.ref,
      subnetName: s.subnetName,
      az: s.az,
      cidrBlock: s.cidrBlock,
    }));

    const logDestinationConfigs = [];

    if (props.nfwFlowLogging === 'S3') {
      logDestinationConfigs.push({
        logDestinationType: 'S3',
        logType: 'FLOW',
        logDestination: {
          bucketName: props.logBucket?.bucketName || '',
        },
      });
    }

    if (props.nfwAlertLogging === 'S3') {
      logDestinationConfigs.push({
        logDestinationType: 'S3',
        logType: 'ALERT',
        logDestination: {
          bucketName: props.logBucket?.bucketName || '',
        },
      });
    }

    if (props.nfwFlowLogging === 'CloudWatch') {
      logDestinationConfigs.push({
        logDestinationType: 'CloudWatchLogs',
        logType: 'FLOW',
        logDestination: {
          logGroup: cwFlowGroup.logGroupName,
        },
      });
    }

    if (props.nfwAlertLogging === 'CloudWatch') {
      logDestinationConfigs.push({
        logDestinationType: 'CloudWatchLogs',
        logType: 'ALERT',
        logDestination: {
          logGroup: cwAlertGroup.logGroupName,
        },
      });
    }

    if (logDestinationConfigs.length > 0) {
      const nfwLogging = new nfw.CfnLoggingConfiguration(this, `${this.nfwName}LoggingGroup`, {
        firewallArn: this.firewall.ref,
        loggingConfiguration: {
          logDestinationConfigs,
        },
      });
    }

    this.nfwOutput = subnetsOutput.map((subnet, index) => {
      const endpointAttr = Fn.select(index, this.firewall.attrEndpointIds);
      const splitAttr = Fn.split(':', endpointAttr, 2);
      const az = splitAttr[0];
      const vpcEndpoint = splitAttr[1];
      const subnets = subnetsOutput;
      return { az, vpcEndpoint, subnets };
    });
  }
}
