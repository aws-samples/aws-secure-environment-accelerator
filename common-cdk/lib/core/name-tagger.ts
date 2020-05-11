import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as elb from '@aws-cdk/aws-elasticloadbalancingv2';
import * as kms from '@aws-cdk/aws-kms';

type Action = (value: cdk.IConstruct) => boolean;

/**
 * Auxiliary interface to allow types as a method parameter.
 */
// tslint:disable-next-line:no-any
type Type<T> = new (...args: any[]) => T;

const NAME_TAG = 'Name';

function addNameTagAsIdWithSuffix<T extends cdk.Construct>(
  type: Type<T>,
  suffix: string,
  tagPriority: number = 100,
): Action {
  return (value: cdk.IConstruct) => {
    if (value instanceof type) {
      const id = value.node.id;
      const name = id.endsWith(suffix) ? id : `${id}${suffix}`; // Only add the suffix if it isn't there yet
      value.node.applyAspect(
        new cdk.Tag(NAME_TAG, name, {
          priority: tagPriority,
        }),
      );
      return true;
    }
    return false;
  };
}

export class AcceleratorNameTagger implements cdk.IAspect {
  // Non-CFN constructs have a tag with higher priority so that the non-CFN construct tag will get priority over the CFN construct tag
  static readonly ACTIONS: Action[] = [
    addNameTagAsIdWithSuffix(ec2.Vpc, '_vpc', 200),
    addNameTagAsIdWithSuffix(ec2.CfnVPC, '_vpc', 100),
    addNameTagAsIdWithSuffix(ec2.Subnet, '_net', 200),
    addNameTagAsIdWithSuffix(ec2.CfnSubnet, '_net', 100),
    addNameTagAsIdWithSuffix(ec2.CfnRouteTable, '_rt'),
    addNameTagAsIdWithSuffix(ec2.CfnTransitGatewayRouteTable, '_rt'),
    addNameTagAsIdWithSuffix(ec2.CfnTransitGateway, '_tgw'),
    addNameTagAsIdWithSuffix(ec2.CfnVPCPeeringConnection, '_pcx'),
    addNameTagAsIdWithSuffix(ec2.SecurityGroup, '_sg', 200),
    addNameTagAsIdWithSuffix(ec2.CfnSecurityGroup, '_sg', 100),
    addNameTagAsIdWithSuffix(ec2.NetworkAcl, '_nacl', 200),
    addNameTagAsIdWithSuffix(ec2.CfnNetworkAcl, '_nacl', 100),
    addNameTagAsIdWithSuffix(ec2.CfnDHCPOptions, '_dhcp'),
    addNameTagAsIdWithSuffix(ec2.CfnVolume, '_ebs'),
    addNameTagAsIdWithSuffix(ec2.CfnInternetGateway, '_igw'),
    addNameTagAsIdWithSuffix(ec2.CfnNatGateway, ''),
    addNameTagAsIdWithSuffix(ec2.CfnVPNGateway, '_vpg'),
    addNameTagAsIdWithSuffix(ec2.CfnCustomerGateway, '_cgw'),
    addNameTagAsIdWithSuffix(ec2.VpnConnection, '_vpn', 200),
    addNameTagAsIdWithSuffix(ec2.CfnVPNConnection, '_vpn', 100),
    addNameTagAsIdWithSuffix(kms.Key, '_key', 200),
    addNameTagAsIdWithSuffix(kms.CfnKey, '_key', 100),
    addNameTagAsIdWithSuffix(elb.ApplicationLoadBalancer, '_alb', 200),
    addNameTagAsIdWithSuffix(elb.NetworkLoadBalancer, '_nlb', 200),
  ];

  visit(node: cdk.IConstruct): void {
    for (const action of AcceleratorNameTagger.ACTIONS) {
      if (action(node)) {
        // Break to only apply the first action that matches
        break;
      }
    }
  }
}
