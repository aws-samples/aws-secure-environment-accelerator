import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as elb from '@aws-cdk/aws-elasticloadbalancingv2';
import * as kms from '@aws-cdk/aws-kms';

export class AcceleratorNameTagger implements cdk.IAspect {
  static readonly NAME_TAG = 'Name';

  static readonly SUFFIXES: { [suffix: string]: (value: any) => value is cdk.ITaggable } = {
    '_vpc': is(ec2.CfnVPC),
    '_net': is(ec2.CfnSubnet),
    '_rt': is(ec2.CfnRouteTable),
    '_tgw': is(ec2.CfnTransitGateway),
    '_pcx': is(ec2.CfnVPCPeeringConnection),
    '_sg': is(ec2.CfnSecurityGroup),
    '_nacl': is(ec2.CfnNetworkAcl),
    '_dhcp': is(ec2.CfnDHCPOptions),
    '_ebs': is(ec2.CfnVolume),
    '_igw': is(ec2.CfnInternetGateway),
    '_ngw': is(ec2.CfnNatGateway),
    '_vpg': is(ec2.CfnVPNGateway),
    '_cgw': is(ec2.CfnCustomerGateway),
    '_vpn': is(ec2.CfnVPNConnection),
    '_key': is(kms.CfnKey),
    '_alb': (value: any): value is elb.CfnLoadBalancer => value instanceof elb.CfnLoadBalancer && value.type === 'application',
    '_nlb': (value: any): value is elb.CfnLoadBalancer => value instanceof elb.CfnLoadBalancer && value.type === 'network',
    // '_ami'
    // '_snap'
    // '_agw'
    // '_nvpce': is(ec2.CfnVPCEndpoint),
    // '_lgw': is(ec2.CfnLocalGatewayRouteTableVPCAssociation),
  };

  visit(node: cdk.IConstruct): void {
    for (const suffix in AcceleratorNameTagger.SUFFIXES) {
      const condition = AcceleratorNameTagger.SUFFIXES[suffix];
      if (condition(node)) {
        node.tags.setTag(AcceleratorNameTagger.NAME_TAG, `${node.node.id}${suffix}`);
      }
    }
  }
}

interface Type<T> extends Function {
  new(...args: any[]): T;
}

function is<T extends cdk.ITaggable>(clazz: Type<T>): (value: any) => value is T {
  return (value: any): value is T => value instanceof clazz;
}
