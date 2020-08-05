import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import { getStackJsonOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import { pascalCase } from 'pascal-case';
import { getAccountId, Account } from '../utils/accounts';
import { VpcProps, VpcStack, Vpc } from '../common/vpc';
import { Limit } from '../utils/limits';
import { NestedStack } from '@aws-cdk/aws-cloudformation';
import {
  InterfaceEndpointConfig,
  PeeringConnectionConfig,
  IamConfig,
  IamConfigType,
  IamPolicyConfigType,
  VpcConfig,
} from '@aws-pbmm/common-lambda/lib/config';
import { InterfaceEndpoint } from '../common/interface-endpoints';
import { CfnVpcOutput } from '../deployments/vpc';
import { IamAssets } from '../common/iam-assets';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';
import { createRoleName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import { CentralBucketOutput, LogBucketOutput } from '../deployments/defaults/outputs';
import * as budget from '../deployments/billing/budget';
import * as centralServices from '../deployments/central-services';
import * as certificates from '../deployments/certificates';
import * as defaults from '../deployments/defaults';
import * as firewall from '../deployments/firewall/cluster';
import * as firewallSubscription from '../deployments/firewall/subscription';
import * as reports from '../deployments/reports';
import * as ssm from '../deployments/ssm/session-manager';
import * as macie from '../deployments/macie';
import * as guardDutyDeployment from '../deployments/guardduty';
import { PhaseInput } from './shared';
import { getIamUserPasswordSecretValue } from '../deployments/iam';
import * as cwlCentralLoggingToS3 from '../deployments/central-services/central-logging-s3';
import * as securityHub from '../deployments/security-hub';

export interface IamPolicyArtifactsOutput {
  bucketArn: string;
  bucketName: string;
  keyPrefix: string;
}

/**
 * This is the main entry point to deploy phase 1.
 *
 * The following resources are deployed in phase 1:
 *   - Vpc
 *   - Subnets
 *   - Subnet sharing (RAM)
 *   - Route tables
 *   - Transit gateways
 *   - Internet gateways
 *   - NAT gateways
 *   - Interface endpoints
 *   - Gateway endpoints
 *   - Flow logs
 */
export async function deploy({ acceleratorConfig, accountStacks, accounts, context, limiter, outputs }: PhaseInput) {
  const mandatoryAccountConfig = acceleratorConfig.getMandatoryAccountConfigs();
  const orgUnits = acceleratorConfig.getOrganizationalUnits();
  const masterAccountKey = acceleratorConfig.getMandatoryAccountKey('master');
  const logAccountKey = acceleratorConfig.getMandatoryAccountKey('central-log');
  const masterAccountId = getAccountId(accounts, masterAccountKey);
  if (!masterAccountId) {
    throw new Error(`Cannot find mandatory primary account ${masterAccountKey}`);
  }

  const { acceleratorName } = context;
  // Find the central bucket in the outputs
  const centralBucket = CentralBucketOutput.getBucket({
    accountStacks,
    config: acceleratorConfig,
    outputs,
  });

  const logBucket = LogBucketOutput.getBucket({
    accountStacks,
    config: acceleratorConfig,
    outputs,
  });

  // Find the account buckets in the outputs
  const accountBuckets = await defaults.step2({
    accounts,
    accountStacks,
    centralLogBucket: logBucket,
    config: acceleratorConfig,
  });

  await securityHub.step1({
    accountStacks,
    accounts,
    config: acceleratorConfig,
    outputs,
  });

  /**
   * Creates IAM Role in source Account and provide assume permissions to target acceleratorExecutionRole
   * @param roleName : Role Name for peering connection from source to target
   * @param sourceAccount : Source Account Key, Role will be created in this
   * @param accountKey : Target Account Key, Access will be provided to this account
   */
  const createIamRoleForPCXAcceptence = (
    roleName: string,
    sourceAccount: string,
    sourceVpcConfig: VpcConfig,
    targetAccount: string,
  ) => {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(sourceAccount, sourceVpcConfig.region);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${sourceAccount}`);
      return;
    }
    const existing = accountStack.node.tryFindChild(roleName);
    if (existing) {
      return;
    }
    const peeringRole = new iam.Role(accountStack, 'PeeringRole', {
      roleName,
      assumedBy: new iam.ArnPrincipal(
        `arn:aws:iam::${getAccountId(accounts, targetAccount)}:role/${context.acceleratorExecutionRoleName}`,
      ),
    });

    peeringRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        resources: ['*'],
        actions: ['ec2:AcceptVpcPeeringConnection'],
      }),
    );
  };

  // Auxiliary method to create a VPC in the account with given account key
  const createVpc = (accountKey: string, props: VpcProps): Vpc | undefined => {
    const { vpcConfig } = props;

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, vpcConfig.region);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      return;
    }

    const vpcStackPrettyName = pascalCase(props.vpcConfig.name);

    const vpcStack = new VpcStack(accountStack, `VpcStack${vpcStackPrettyName}`, props);
    const vpc = vpcStack.vpc;

    const endpointConfig = vpcConfig['interface-endpoints'];
    if (InterfaceEndpointConfig.is(endpointConfig)) {
      const subnetName = endpointConfig.subnet;
      const subnetIds = vpc.azSubnets.getAzSubnetIdsForSubnetName(subnetName);
      if (subnetIds.length === 0) {
        console.warn(`Cannot find subnet ID with name "${subnetName}'`);
        return;
      }

      let endpointCount = 0;
      let endpointStackIndex = 0;
      let endpointStack;
      for (const endpoint of endpointConfig.endpoints) {
        if (!limiter.create(accountKey, Limit.VpcInterfaceEndpointsPerVpc, vpc.name)) {
          console.log(
            `Skipping endpoint "${endpoint}" creation in VPC "${vpc.name}". Reached maximum interface endpoints per VPC`,
          );
          continue;
        }

        if (!endpointStack || endpointCount >= 30) {
          endpointStack = new NestedStack(accountStack, `Endpoint${endpointStackIndex++}`);
          endpointCount = 0;
        }
        new InterfaceEndpoint(endpointStack, pascalCase(endpoint), {
          serviceName: endpoint,
          vpcId: vpc.vpcId,
          vpcRegion: vpc.region,
          subnetIds,
        });
        endpointCount++;
      }
    }

    // Store the VPC output so that subsequent phases can access the output
    new CfnVpcOutput(vpc, `VpcOutput`, {
      accountKey,
      region: props.vpcConfig.region,
      vpcId: vpc.vpcId,
      vpcName: props.vpcConfig.name,
      cidrBlock: props.vpcConfig.cidr.toCidrString(),
      additionalCidrBlocks: vpc.additionalCidrBlocks,
      subnets: vpc.azSubnets.subnets.map(s => ({
        subnetId: s.subnet.ref,
        subnetName: s.subnetName,
        az: s.az,
        cidrBlock: s.cidrBlock,
      })),
      routeTables: vpc.routeTableNameToIdMap,
      securityGroups: Object.entries(vpc.securityGroup?.securityGroupNameMapping || {}).map(
        ([name, securityGroup]) => ({
          securityGroupId: securityGroup.ref,
          securityGroupName: name,
        }),
      ),
    });

    return vpcStack.vpc;
  };

  const subscriptionCheckDone: string[] = [];
  // Create all the VPCs for accounts and organizational units
  for (const { ouKey, accountKey, vpcConfig, deployments } of acceleratorConfig.getVpcConfigs()) {
    if (!limiter.create(accountKey, Limit.VpcPerRegion, vpcConfig.region)) {
      console.log(
        `Skipping VPC "${vpcConfig.name}" deployment. Reached maximum VPCs per region for account "${accountKey}" and region "${vpcConfig.region}`,
      );
      continue;
    }

    console.debug(
      `Deploying VPC "${vpcConfig.name}" in account "${accountKey}"${
        ouKey ? ` and organizational unit "${ouKey}"` : ''
      }`,
    );
    const vpc = createVpc(accountKey, {
      accountKey,
      accountStacks,
      limiter,
      accounts,
      vpcConfig,
      tgwDeployments: deployments?.tgw,
      organizationalUnitName: ouKey,
      vpcConfigs: acceleratorConfig.getVpcConfigs(),
      outputs,
      acceleratorName,
    });

    const pcxConfig = vpcConfig.pcx;
    if (PeeringConnectionConfig.is(pcxConfig)) {
      const sourceVpcConfig = acceleratorConfig
        .getVpcConfigs()
        .find(x => x.accountKey === pcxConfig.source && x.vpcConfig.name === pcxConfig['source-vpc']);
      if (!sourceVpcConfig) {
        console.warn(`Cannot find PCX source VPC ${pcxConfig['source-vpc']} in account ${pcxConfig.source}`);
      } else {
        // Create Accepter Role for Peering Connection **WITHOUT** random suffix
        // TODO Region support
        const roleName = createRoleName(`VPC-PCX-${pascalCase(accountKey)}To${pascalCase(pcxConfig.source)}`, 0);
        createIamRoleForPCXAcceptence(roleName, pcxConfig.source, sourceVpcConfig.vpcConfig, accountKey);
      }
    }

    // Validate subscription for Firewall images only once per account
    // TODO Add region to check
    // TODO Check if VPC or deployments exists
    if (!subscriptionCheckDone.includes(accountKey)) {
      console.log(`Checking Subscription for ${accountKey}`);
      await firewallSubscription.validate({
        accountKey,
        deployments: deployments!,
        vpc: vpc!,
        accountStacks,
      });
      subscriptionCheckDone.push(accountKey);
    }
  }

  // Create the firewall
  await firewall.step2({
    accountStacks,
    config: acceleratorConfig,
    outputs,
  });

  const getIamPoliciesDefinition = async (): Promise<{ [policyName: string]: string } | undefined> => {
    const iamPoliciesDef: { [policyName: string]: string } = {};

    const sts = new STS();
    const masterAcctCredentials = await sts.getCredentialsForAccountAndRole(
      masterAccountId,
      context.acceleratorExecutionRoleName,
    );

    // TODO Remove call to S3 here somehow
    const iamPolicyS3 = new S3(masterAcctCredentials);

    const iamPolicyArtifactOutput: IamPolicyArtifactsOutput[] = getStackJsonOutput(outputs, {
      accountKey: masterAccountKey,
      outputType: 'IamPolicyArtifactsOutput',
    });

    if (iamPolicyArtifactOutput.length === 0) {
      console.warn(`Cannot find output with Iam Policy reference artifacts`);
      return;
    }

    const iamPoliciesBucketName = iamPolicyArtifactOutput[0].bucketName;
    const iamPoliciesBucketPrefix = iamPolicyArtifactOutput[0].keyPrefix + '/';

    for (const [accountKey, accountConfig] of mandatoryAccountConfig) {
      const iamConfig = accountConfig.iam;
      if (IamConfigType.is(iamConfig)) {
        const iamPolicies = iamConfig?.policies;
        if (iamPolicies && iamPolicies?.length > 1) {
          for (const iamPolicy of iamPolicies) {
            if (IamPolicyConfigType.is(iamPolicy)) {
              const iamPolicyName = iamPolicy['policy-name'];
              const iamPolicyFileName = iamPolicy.policy;
              const iamPolicyKey = `${iamPoliciesBucketPrefix}${iamPolicyFileName}`;
              try {
                const policyContent = await iamPolicyS3.getObjectBodyAsString({
                  Bucket: iamPoliciesBucketName,
                  Key: iamPolicyKey,
                });
                iamPoliciesDef[iamPolicyName] = policyContent;
              } catch (e) {
                console.warn(`Cannot load IAM policy s3://${iamPoliciesBucketName}/${iamPolicyKey}`);
                throw e;
              }
            }
          }
        }
      }
    }

    return iamPoliciesDef;
  };

  const iamPoliciesDefinition = await getIamPoliciesDefinition();

  const createIamAssets = async (accountKey: string, iamConfig?: IamConfig): Promise<void> => {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      return;
    }

    const userPasswords: { [userId: string]: cdk.SecretValue } = {};

    const users = iamConfig?.users || [];
    const userIds = users.flatMap(u => u['user-ids']);
    for (const userId of userIds) {
      userPasswords[userId] = getIamUserPasswordSecretValue({
        acceleratorPrefix: context.acceleratorPrefix,
        accountKey,
        userId,
        secretAccountId: masterAccountId,
      });
    }

    if (iamPoliciesDefinition) {
      const iamAssets = new IamAssets(accountStack, `IAM Assets-${pascalCase(accountKey)}`, {
        accountKey,
        iamConfig,
        iamPoliciesDefinition,
        accounts,
        userPasswords,
        logBucket,
      });
    }
  };

  const getNonMandatoryAccountsPerOu = (ouName: string, mandatoryAccKeys: string[]): Account[] => {
    const accountsPerOu: Account[] = [];
    for (const account of accounts) {
      if (account.ou === ouName && !mandatoryAccKeys.includes(account.key)) {
        accountsPerOu.push(account);
      }
    }
    return accountsPerOu;
  };

  const mandatoryAccountKeys: string[] = [];
  // creating assets for default account settings
  for (const [accountKey, accountConfig] of mandatoryAccountConfig) {
    mandatoryAccountKeys.push(accountKey);
    await createIamAssets(accountKey, accountConfig.iam);
  }

  // creating assets for org unit accounts
  for (const [orgName, orgConfig] of orgUnits) {
    const orgAccounts = getNonMandatoryAccountsPerOu(orgName, mandatoryAccountKeys);
    for (const orgAccount of orgAccounts) {
      await createIamAssets(orgAccount.key, orgConfig.iam);
    }
  }

  // Budget creation step 2
  await budget.step2({
    accountStacks,
    config: acceleratorConfig,
  });

  await certificates.step1({
    accountStacks,
    centralBucket,
    config: acceleratorConfig,
  });

  // Central Services step 1
  await centralServices.step2({
    accountStacks,
    config: acceleratorConfig,
    accounts,
  });

  // SSM config step 1
  await ssm.step1({
    accountStacks,
    bucketName: logBucket.bucketName,
    config: acceleratorConfig,
  });

  // Cost and usage reports step 1
  await reports.step1({
    accountBuckets,
    accountStacks,
    config: acceleratorConfig,
  });

  // Macie step 2
  await macie.enableMaciePolicy({
    accountBuckets,
    accountStacks,
    accounts,
    config: acceleratorConfig,
    outputs,
  });
  await macie.step2({
    accountStacks,
    accounts,
    config: acceleratorConfig,
    outputs,
  });

  if (!acceleratorConfig['global-options']['alz-baseline']) {
    /**
     * Step 2 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
     * Step 3 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
     *
     * @param props accountStacks and config passed from phases
     */
    await guardDutyDeployment.step2({
      accountStacks,
      config: acceleratorConfig,
      accounts,
      outputs,
    });
  }

  await guardDutyDeployment.step3({
    accountStacks,
    config: acceleratorConfig,
    accounts,
    logBucket,
    outputs,
  });

  // Central Services step 1
  const shardCount = acceleratorConfig['global-options']['central-log-services']['kinesis-stream-shard-count'];
  const logsAccountStack = accountStacks.getOrCreateAccountStack(logAccountKey);
  await cwlCentralLoggingToS3.step1({
    accountStack: logsAccountStack,
    accounts,
    logBucket,
    shardCount,
  });
}
