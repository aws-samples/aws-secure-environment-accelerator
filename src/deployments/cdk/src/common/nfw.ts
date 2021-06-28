import * as nfw from '@aws-cdk/aws-networkfirewall';
import { Construct } from '@aws-cdk/core';
import { AzSubnet } from './vpc';

export interface NfwProps {
  subnets: AzSubnet[];
  vpcId: string;
  nfwPolicyConfig: {
    name: string;
    path: string;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nfwPolicy: any;
}

export class Nfw extends Construct {
  private vpcId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private nfwPolicyConfig: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private nfwPolicy: any;
  readonly firewall: nfw.CfnFirewall;
  constructor(scope: Construct, id: string, props: NfwProps) {
    super(scope, id);
    this.vpcId = props.vpcId;
    this.nfwPolicy = JSON.parse(props.nfwPolicy);
    this.nfwPolicyConfig = props.nfwPolicyConfig;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const policy: any = {};
    if (this.nfwPolicy.statelessRuleGroup) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const statelessRuleGroup: any[] = this.nfwPolicy.statelessRuleGroup.map((ruleGroup: any) => {
        return {
          group: new nfw.CfnRuleGroup(this, `${ruleGroup.ruleGroupName}-rule`, ruleGroup),
          priority: ruleGroup.priority,
        };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      policy.statelessRuleGroupReferences = statelessRuleGroup.map((ruleGroup: any) => {
        return { resourceArn: ruleGroup.group.ref, priority: ruleGroup.priority };
      });
    }
    if (this.nfwPolicy.statefulRuleGroup) {
      const statefulRuleGroup: nfw.CfnRuleGroup[] = this.nfwPolicy.statefulRuleGroup.map(
        (ruleGroup: nfw.CfnRuleGroupProps) => {
          return new nfw.CfnRuleGroup(this, `${ruleGroup.ruleGroupName}-rule`, ruleGroup);
        },
      );
      policy.statefulRuleGroupReferences = statefulRuleGroup.map(ruleGroup => {
        return { resourceArn: ruleGroup.ref };
      });
    }

    policy.statelessFragmentDefaultActions = this.nfwPolicy.statelessFragmentDefaultActions;
    policy.statelessDefaultActions = this.nfwPolicy.statelessDefaultActions;
    const subnetIds = props.subnets.map(subnet => {
      return { subnetId: subnet.id };
    });

    console.log('nfwpol', policy);
    const nfwpol = new nfw.CfnFirewallPolicy(this, `${this.nfwPolicyConfig.name}-pol`, {
      firewallPolicyName: `${this.nfwPolicyConfig.name}-pol`,
      firewallPolicy: policy,
    });
    this.firewall = new nfw.CfnFirewall(this, `${this.nfwPolicyConfig.name}`, {
      firewallName: `${this.nfwPolicyConfig.name}`,
      firewallPolicyArn: nfwpol.ref,
      subnetMappings: subnetIds,
      vpcId: this.vpcId,
    });
  }
}
