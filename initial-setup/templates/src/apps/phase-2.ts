import * as cdk from '@aws-cdk/core';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import * as iam from '@aws-cdk/aws-iam';
import { pascalCase } from 'pascal-case';
import { loadStackOutputs } from '../utils/outputs';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { JsonOutputValue } from '../common/json-output';
import { GlobalOptionsDeployment } from '../common/global-options';
import { getVpcConfig } from '../common/get-all-vpcs';
import { VpcOutput } from './phase-1';
import { getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import * as ec2 from '@aws-cdk/aws-ec2';
import { SecretsStack } from '@aws-pbmm/common-cdk/lib/core/secrets-stack';
import { ActiveDirectory } from '../common/active-directory';
import { PeeringConnectionConfig, VpcConfigType } from '@aws-pbmm/common-lambda/lib/config';
import { getVpcSharedAccounts } from '../common/vpc-subnet-sharing';
import { SecurityGroup } from '../common/security-group';
import { AddTagsToResourcesOutput } from '../common/add-tags-to-resources-output';
import { SecurityHubStack } from '../common/security-hub';

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
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const outputs = await loadStackOutputs();

  const app = new cdk.App();
  const rolesForPeering: string[] = [];

  /**
   * Creates IAM Role in source Account and provide assume permisions to target acceleratorExecutionRole
   * @param roleName : Role Name forpeering connection from source to target
   * @param sourceAccount : Source Account Key, Role will be created in this
   * @param accountKey : Target Account Key, Access will be provided to this accout
   */
  const createIamRole = (roleName: string, sourceAccount: string, targetAccount: string) => {
    if (rolesForPeering.includes(roleName)) {
      return;
    }
    const iamRolePeering = new AcceleratorStack(app, `PBMMAccel-B-${roleName}Stack`, {
      env: {
        account: getAccountId(accounts, sourceAccount),
        region: cdk.Aws.REGION,
      },
      stackName: `PBMMAccel-B-${roleName}Stack`,
      acceleratorName: context.acceleratorName,
      acceleratorPrefix: context.acceleratorPrefix,
    });

    const peeringRole = new iam.Role(iamRolePeering, roleName, {
      roleName,
      assumedBy: new iam.ArnPrincipal(
        `arn:aws:iam::${getAccountId(accounts, targetAccount)}:role/${context.acceleratorExecutionRoleName}`,
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
  const globalOptionsConfig = acceleratorConfig['global-options'];
  const zonesConfig = globalOptionsConfig.zones;
  const zonesAccountKey = zonesConfig.account;

  const deployment = new AcceleratorStack(app, 'PBMMAccel-A-GlobalOptionsDNSResolversStack', {
    env: {
      account: getAccountId(accounts, zonesAccountKey),
      region: cdk.Aws.REGION,
    },
    stackName: `PBMMAccel-A-GlobalOptionsDNSResolvers`,
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
  });

  new GlobalOptionsDeployment(deployment, `GlobalOptionsDNSResolvers`, {
    accounts,
    outputs,
    context,
    acceleratorConfig,
  });

  /**
   * Code to create Peering Connection in all accounts
   */

  const vpcConfigs = acceleratorConfig.getVpcConfigs();
  for (const { accountKey, vpcConfig } of vpcConfigs) {
    const pcxConfig = vpcConfig.pcx;
    if (!PeeringConnectionConfig.is(pcxConfig)) {
      continue;
    }
    const pcxSourceVpc = pcxConfig['source-vpc'];
    const roleName = pascalCase(`VPCPeeringAccepter${accountKey}To${pcxConfig.source}`);
    createIamRole(roleName, pcxConfig.source, accountKey);
    const peerRoleArn = `arn:aws:iam::${getAccountId(accounts, pcxConfig.source)}:role/${roleName}`;

    const pcxDeployment = new AcceleratorStack(app, `PBMMAccel-C-PcxDeployment${accountKey}${pcxSourceVpc}Stack`, {
      env: {
        account: getAccountId(accounts, accountKey),
        region: cdk.Aws.REGION,
      },
      stackName: `PBMMAccel-C-PcxDeployments${accountKey}${vpcConfig.name}Stack`,
      acceleratorName: context.acceleratorName,
      acceleratorPrefix: context.acceleratorPrefix,
    });

    // Get Peer VPC Configuration
    const peerVpcConfig = getVpcConfig(vpcConfigs, pcxConfig.source, pcxSourceVpc);
    if (!VpcConfigType.is(peerVpcConfig)) {
      throw new Error(`No configuration found for Peer VPC "${pcxSourceVpc}"`);
    }
    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      accountKey,
      outputType: 'VpcOutput',
    });
    const vpcOutput = vpcOutputs.find(x => x.vpcName === vpcConfig.name);
    if (!vpcOutput) {
      throw new Error(`No VPC Found in outputs for VPC name "${vpcConfig.name}"`);
    }
    const peerVpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      accountKey: pcxConfig.source,
      outputType: 'VpcOutput',
    });
    const peerVpcOutout = peerVpcOutputs.find(x => x.vpcName === pcxSourceVpc);
    if (!peerVpcOutout) {
      throw new Error(`No VPC Found in outputs for VPC name "${pcxSourceVpc}"`);
    }
    const peerOwnerId = getAccountId(accounts, pcxConfig.source);

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

  const masterStack = new AcceleratorStack(app, `master`, {
    env: {
      account: getAccountId(accounts, 'master'),
      region: cdk.Aws.REGION,
    },
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
    stackName: `PBMMAccel-${pascalCase('master')}`,
  });
  const secretsStack = new SecretsStack(masterStack, 'Secrets');

  const accountConfigs = acceleratorConfig.getAccountConfigs();
  for (const [accountKey, accountConfig] of accountConfigs) {
    const madDeploymentConfig = accountConfig.deployments?.mad;
    if (!madDeploymentConfig || !madDeploymentConfig.deploy) {
      continue;
    }
    const accountId = getAccountId(accounts, accountKey);

    const stack =
      accountKey === 'master'
        ? masterStack
        : new AcceleratorStack(app, `${accountKey}`, {
            env: {
              account: accountId,
              region: cdk.Aws.REGION,
            },
            acceleratorName: context.acceleratorName,
            acceleratorPrefix: context.acceleratorPrefix,
            stackName: `PBMMAccel-${pascalCase(accountKey)}`,
          });

    const madPassword = secretsStack.createSecret('MadPassword', {
      secretName: `accelerator/${accountKey}/mad/password`,
      description: 'Password for Managed Active Directory.',
      generateSecretString: {
        passwordLength: 16,
      },
      principals: [new iam.AccountPrincipal(accountId)],
    });

    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
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
    const sharedToAccounts = getVpcSharedAccounts(accounts, vpcConfig, ouKey);
    const shareToAccountIds = Array.from(new Set(sharedToAccounts));
    if (sharedToAccounts.length > 0) {
      console.log(`Share VPC "${vpcConfig.name}" from Account "${accountKey}" to Accounts "${shareToAccountIds}"`);
    }
    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      accountKey,
      outputType: 'VpcOutput',
    });
    const vpcOutput = vpcOutputs.find(x => x.vpcName === vpcConfig.name);
    for (const [index, sharedAccountId] of shareToAccountIds.entries()) {
      // Initiating Security Group creation in shared account
      const securityGroupStack = new AcceleratorStack(app, `SecurityGroups${vpcConfig.name}-Shared-${index + 1}`, {
        env: {
          account: sharedAccountId,
          region: cdk.Aws.REGION,
        },
        acceleratorName: context.acceleratorName,
        acceleratorPrefix: context.acceleratorPrefix,
        stackName: `PBMMAccel-SecurityGroups${vpcConfig.name}-Shared-${index + 1}`,
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
      const accountId = getAccountId(accounts, accountKey);
      const securityGroupsResources = Object.values(securityGroups.securityGroupNameMapping);
      new AddTagsToResourcesOutput(securityGroupStack, `OutputSharedResources${vpcConfig.name}-Shared-${index}`, {
        dependencies: securityGroupsResources,
        produceResources: () =>
          securityGroupsResources.map(securityGroup => ({
            resourceId: securityGroup.ref,
            resourceType: 'security-group',
            targetAccountIds: [accountId],
            tags: securityGroup.tags.renderTags(),
          })),
      });
    }
  }

  // Deploy Security Hub
  const globalOptions = acceleratorConfig['global-options'];
  const securityMasterAccount = accounts.find(a => a.type === 'security' && a.ou === 'core');
  const subAccountIds = accounts.map(account => {
    return {
      AccountId: account.id,
      Email: account.email,
    };
  });
  console.log(subAccountIds);
  // Create Security Hub stack for Master Account
  const securityHubMaster = new SecurityHubStack(app, `PBMMAccel-SecurityHub-A-${securityMasterAccount?.key}-Stack`, {
    env: {
      account: securityMasterAccount?.id,
      region: cdk.Aws.REGION,
    },
    account: securityMasterAccount!,
    acceptInvitationFuncArn: context.cfnCustomResourceFunctions.acceptInviteSecurityHubFunctionArn,
    enableStandardsFuncArn: context.cfnCustomResourceFunctions.enableSecurityHubFunctionArn,
    inviteMembersFuncArn: context.cfnCustomResourceFunctions.inviteMembersSecurityHubFunctionArn,
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
    standards: globalOptions['security-hub-frameworks'],
    stackName: `PBMMAccel-SecurityHub-A-${securityMasterAccount?.key}-Stack`,
    subAccountIds,
  });

  for (const account of accounts) {
    if (account.id === securityMasterAccount?.id) {
      continue;
    }
    const securityHubMember = new SecurityHubStack(app, `PBMMAccel-SecurityHub-B-${account.key}-Stack`, {
      env: {
        account: account.id,
        region: cdk.Aws.REGION,
      },
      account,
      acceptInvitationFuncArn: context.cfnCustomResourceFunctions.acceptInviteSecurityHubFunctionArn,
      enableStandardsFuncArn: context.cfnCustomResourceFunctions.enableSecurityHubFunctionArn,
      inviteMembersFuncArn: context.cfnCustomResourceFunctions.inviteMembersSecurityHubFunctionArn,
      acceleratorName: context.acceleratorName,
      acceleratorPrefix: context.acceleratorPrefix,
      standards: globalOptions['security-hub-frameworks'],
      stackName: `PBMMAccel-SecurityHub-B-${account.key}-Stack`,
      masterAccountId: securityMasterAccount?.id,
    });
  }
}

// tslint:disable-next-line: no-floating-promises
main();
