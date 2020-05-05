import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as ec2 from '@aws-cdk/aws-ec2';
import { pascalCase } from 'pascal-case';
import { getStackJsonOutput } from '@aws-pbmm/common-outputs/lib/outputs';
import { LandingZoneAccountType } from '@aws-pbmm/common-outputs/lib/accounts';
import { SecretsStack } from '@aws-pbmm/common-cdk/lib/core/secrets-stack';
import { PeeringConnectionConfig, VpcConfigType } from '@aws-pbmm/common-lambda/lib/config';
import { AcceleratorStack } from '../common/accelerator-stack';
import { JsonOutputValue } from '../common/json-output';
import { GlobalOptionsDeployment } from '../common/global-options';
import { getVpcConfig } from '../common/get-all-vpcs';
import { VpcOutput } from './phase-1';
import { ActiveDirectory } from '../common/active-directory';
import { getVpcSharedAccounts } from '../common/vpc-subnet-sharing';
import { SecurityGroup } from '../common/security-group';
import { AddTagsToResourcesOutput } from '../common/add-tags-to-resources-output';
import { Context } from '../utils/context';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

export interface MadRuleOutput {
  [key: string]: string;
}

export interface ResolverRulesOutput {
  onPremRules?: string[];
  inBoundRule?: string;
  madRules?: MadRuleOutput;
}

export interface ResolversOutput {
  vpcName: string;
  inBound?: string;
  outBound?: string;
  rules?: ResolverRulesOutput;
}

async function main() {
  const context = await Context.load();

  const app = new cdk.App();
  const rolesForPeering: string[] = [];

  /**
   * Creates IAM Role in source Account and provide assume permisions to target acceleratorExecutionRole
   * @param roleName : Role Name forpeering connection from source to target
   * @param sourceAccount : Source Account Key, Role will be created in this
   * @param accountKey : Target Account Key, Access will be provided to this accout
   */
  const createIamRole = (roleName: string, sourceAccountKey: string, targetAccountKey: string) => {
    if (rolesForPeering.includes(roleName)) {
      return;
    }
    const sourceAccount = context.accounts.getAccountByKey(sourceAccountKey);
    const targetAccount = context.accounts.getAccountByKey(targetAccountKey);

    const iamRolePeering = new AcceleratorStack(app, `PBMMAccel-B-${roleName}Stack`, {
      stackName: `PBMMAccel-B-${roleName}Stack`,
      context,
      account: sourceAccount,
    });

    const peeringRole = new iam.Role(iamRolePeering, roleName, {
      roleName,
      assumedBy: new iam.ArnPrincipal(
        `arn:aws:iam::${targetAccount.id}:role/${context.environment.acceleratorExecutionRoleName}`,
      ),
    });

    peeringRole.addToPolicy(
      new iam.PolicyStatement({
        resources: ['*'],
        actions: ['ec2:AcceptVpcPeeringConnection'],
      }),
    );
    rolesForPeering.push(roleName);
  };

  /**
   * Code to create DNS Resolvers
   */
  const globalOptionsConfig = context.config['global-options'];
  const zonesConfig = globalOptionsConfig.zones;
  const zonesAccount = context.accounts.getAccountByKey(zonesConfig.account);

  const deployment = new AcceleratorStack(app, 'PBMMAccel-A-GlobalOptionsDNSResolversStack', {
    stackName: `PBMMAccel-A-GlobalOptionsDNSResolvers`,
    context,
    account: zonesAccount,
  });

  new GlobalOptionsDeployment(deployment, `GlobalOptionsDNSResolvers`, {
    context,
  });

  /**
   * Code to create Peering Connection in all accounts
   */

  const vpcConfigs = context.config.getVpcConfigs();
  for (const { accountKey, vpcConfig } of vpcConfigs) {
    const pcxConfig = vpcConfig.pcx;
    if (!PeeringConnectionConfig.is(pcxConfig)) {
      continue;
    }
    const account = context.accounts.getAccountByKey(accountKey);
    const sourceAccount = context.accounts.getAccountByKey(pcxConfig.source);

    const pcxSourceVpc = pcxConfig['source-vpc'];
    const roleName = pascalCase(`VPCPeeringAccepter${accountKey}To${pcxConfig.source}`);
    createIamRole(roleName, pcxConfig.source, accountKey);
    const peerRoleArn = `arn:aws:iam::${sourceAccount.id}:role/${roleName}`;

    const pcxDeployment = new AcceleratorStack(app, `PBMMAccel-C-PcxDeployment${accountKey}${pcxSourceVpc}Stack`, {
      stackName: `PBMMAccel-C-PcxDeployments${accountKey}${vpcConfig.name}Stack`,
      context,
      account,
    });

    // Get Peer VPC Configuration
    const peerVpcConfig = getVpcConfig(vpcConfigs, pcxConfig.source, pcxSourceVpc);
    if (!VpcConfigType.is(peerVpcConfig)) {
      throw new Error(`No configuration found for Peer VPC "${pcxSourceVpc}"`);
    }
    const vpcOutputs: VpcOutput[] = getStackJsonOutput(context.outputs, {
      accountKey,
      outputType: 'VpcOutput',
    });
    const vpcOutput = vpcOutputs.find(x => x.vpcName === vpcConfig.name);
    if (!vpcOutput) {
      throw new Error(`No VPC Found in outputs for VPC name "${vpcConfig.name}"`);
    }
    const peerVpcOutputs: VpcOutput[] = getStackJsonOutput(context.outputs, {
      accountKey: pcxConfig.source,
      outputType: 'VpcOutput',
    });
    const peerVpcOutout = peerVpcOutputs.find(x => x.vpcName === pcxSourceVpc);
    if (!peerVpcOutout) {
      throw new Error(`No VPC Found in outputs for VPC name "${pcxSourceVpc}"`);
    }
    const peerOwnerId = sourceAccount.id;

    const pcx = new ec2.CfnVPCPeeringConnection(pcxDeployment, `${vpcConfig.name}-${pcxSourceVpc}_pcx`, {
      vpcId: vpcOutput.vpcId,
      peerVpcId: peerVpcOutout.vpcId,
      peerRoleArn,
      peerOwnerId,
    });

    vpcOutput.pcx = pcx.ref;

    // Store the VPC output so that subsequent phases can access the output
    new JsonOutputValue(pcxDeployment, `VpcOutput`, {
      type: 'VpcOutput',
      // tslint:disable-next-line deprecation
      value: vpcOutput,
    });
  }

  const primaryAccount = context.accounts.getAccountByType(LandingZoneAccountType.Primary);
  const secretsStack = new SecretsStack(app, 'Secrets', {
    env: {
      account: primaryAccount.id,
      region: cdk.Aws.REGION,
    },
    acceleratorName: context.environment.acceleratorName,
    acceleratorPrefix: context.environment.acceleratorPrefix,
    stackName: 'PBMMAccel-Secrets',
  });

  const accountConfigs = context.config.getAccountConfigs();
  for (const [accountKey, accountConfig] of accountConfigs) {
    const madDeploymentConfig = accountConfig.deployments?.mad;
    if (!madDeploymentConfig || !madDeploymentConfig.deploy) {
      continue;
    }
    const account = context.accounts.getAccountByKey(accountKey);
    const madPassword = secretsStack.createSecret('MadPassword', {
      secretName: `accelerator/${accountKey}/mad/password`,
      description: 'Password for Managed Active Directory.',
      generateSecretString: {
        passwordLength: 16,
      },
      principals: [new iam.AccountPrincipal(account.id)],
    });

    const stack = new AcceleratorStack(app, `${accountKey}`, {
      stackName: `PBMMAccel-${pascalCase(accountKey)}`,
      context,
      account,
    });

    const vpcOutputs: VpcOutput[] = getStackJsonOutput(context.outputs, {
      outputType: 'VpcOutput',
    });
    const vpcOutput = vpcOutputs.find(output => output.vpcName === madDeploymentConfig['vpc-name']);
    if (!vpcOutput) {
      throw new Error(`Cannot find output with vpc name ${madDeploymentConfig['vpc-name']}`);
    }

    const vpcId = vpcOutput.vpcId;
    const subnetIds = vpcOutput.subnets.filter(s => s.subnetName === madDeploymentConfig.subnet).map(s => s.subnetId);

    const activeDirectory = new ActiveDirectory(stack, 'Microsoft AD', {
      madDeploymentConfig,
      subnetInfo: {
        vpcId,
        subnetIds,
      },
      password: madPassword,
    });

    new JsonOutputValue(stack, 'MadOutput', {
      type: 'MadOutput',
      value: {
        id: madDeploymentConfig['dir-id'],
        vpcName: madDeploymentConfig['vpc-name'],
        directoryId: activeDirectory.directoryId,
        dnsIps: cdk.Fn.join(',', activeDirectory.dnsIps),
      },
    });
  }

  // Creating Security Groups in shared accounts to respective accounts
  for (const { ouKey, accountKey, vpcConfig } of vpcConfigs) {
    const account = context.accounts.getAccountByKey(accountKey);

    const sharedToAccounts = getVpcSharedAccounts(context.accounts, vpcConfig, ouKey);
    const shareToAccountIds = Array.from(new Set(sharedToAccounts));
    if (sharedToAccounts.length > 0) {
      console.log(`Share VPC "${vpcConfig.name}" from Account "${accountKey}" to Accounts "${shareToAccountIds}"`);
    }
    const vpcOutputs: VpcOutput[] = getStackJsonOutput(context.outputs, {
      accountKey,
      outputType: 'VpcOutput',
    });
    const vpcOutput = vpcOutputs.find(x => x.vpcName === vpcConfig.name);
    for (const [index, sharedAccountId] of shareToAccountIds.entries()) {
      // Initiating Security Group creation in shared account
      const sharedAccount = context.accounts.getAccountById(sharedAccountId);
      const securityGroupStack = new AcceleratorStack(app, `SecurityGroups${vpcConfig.name}-Shared-${index + 1}`, {
        stackName: `PBMMAccel-SecurityGroups${vpcConfig.name}-Shared-${index + 1}`,
        context,
        account: sharedAccount,
      });
      if (!vpcOutput) {
        throw new Error(`No VPC Found in outputs for VPC name "${vpcConfig.name}"`);
      }
      const securityGroups = new SecurityGroup(securityGroupStack, 'SecurityGroups', {
        vpcConfig,
        vpcId: vpcOutput.vpcId,
        accountKey,
      });
      // Add Tags Output
      const securityGroupsResources = Object.values(securityGroups.securityGroupNameMapping);
      new AddTagsToResourcesOutput(securityGroupStack, `OutputSharedResources${vpcConfig.name}-Shared-${index}`, {
        dependencies: securityGroupsResources,
        produceResources: () =>
          securityGroupsResources.map(securityGroup => ({
            resourceId: securityGroup.ref,
            resourceType: 'security-group',
            targetAccountIds: [account.id],
            tags: securityGroup.tags.renderTags(),
          })),
      });
    }
  }
}

// tslint:disable-next-line: no-floating-promises
main();
