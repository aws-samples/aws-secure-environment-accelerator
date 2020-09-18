# Associate Resolver Rule to VPC

This is a custom resource to Associate VPC to Resoulver Rule Used `associateResolverRule` and `disassociateResolverRule` API calls.

## Usage

    import { AssociateResolverRules } from '@aws-accelerator/custom-resource-associate-resolver-rules';

    new AssociateResolverRules(accountStack, constructName, {
      resolverRuleIds: ruleIds,
      roleArn: roleOutput.roleArn,
      vpcId: vpcOutput.vpcId,
    });
