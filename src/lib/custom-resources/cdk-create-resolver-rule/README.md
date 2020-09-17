# Create Resolver Rule

This is a custom resource to Create Resolver rule and associate to VPC Used `createResolverRule`, `associateResolverRule`, `listResolverRules`, `updateResolverRule`, `disassociateResolverRule`, `deleteResolverRule` and `listResolverRuleAssociations` API calls.

## Usage

    import { CreateResolverRule, TargetIp } from '@aws-accelerator/custom-resource-create-resolver-rule';

    const rule = new CreateResolverRule(accountStack, `${domainToName(onPremRuleConfig.zone)}-${vpcConfig.name}`, {
          domainName: onPremRuleConfig.zone,
          resolverEndpointId: r53ResolverEndpoints.outboundEndpointRef!,
          roleArn: roleOutput.roleArn,
          targetIps,
          vpcId: vpcOutput.vpcId,
          name: createRuleName(`${vpcConfig.name}-onprem-${domainToName(onPremRuleConfig.zone)}`),
        });