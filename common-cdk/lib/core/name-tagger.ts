import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

const nameTag = 'Name';

export class AcceleratorNameTagger implements cdk.IAspect {
  visit(node: cdk.IConstruct): void {
    if (node instanceof ec2.CfnVPC) {
      node.tags.setTag(nameTag, `${node.node.id}_vpc`);
    } else if (node instanceof ec2.CfnSubnet) {
      node.tags.setTag(nameTag, `${node.node.id}_${node.availabilityZone}_net`);
    } else if (node instanceof ec2.CfnRouteTable) {
      node.tags.setTag(nameTag, `${node.node.id}_rt`);
    } else if (node instanceof ec2.CfnTransitGateway) {
      node.tags.setTag(nameTag, `${node.node.id}_tgw`);
    }
    // TODO Add more suffix's
  }
}
