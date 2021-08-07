import * as nfw from '@aws-cdk/aws-networkfirewall';
import { Construct, Fn } from '@aws-cdk/core';
import { AzSubnet } from './vpc';

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
    if (this.nfwPolicy.statelessRuleGroup) {
      const statelessRuleGroup: any[] = this.nfwPolicy.statelessRuleGroup.map((ruleGroup: any) => {
        ruleGroup.ruleGroupName = `${prefix}${ruleGroup.ruleGroupName}`;
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
        ruleGroup.ruleGroupName = `${prefix}${ruleGroup.ruleGroupName}`;
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

    this.policy = new nfw.CfnFirewallPolicy(this, `${prefix}${this.nfwPolicyConfig.name}`, {
      firewallPolicyName: `${prefix}${this.nfwPolicyConfig.name}`,
      firewallPolicy: policy,
    });
    this.firewall = new nfw.CfnFirewall(this, `${prefix}${this.nfwName}`, {
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
