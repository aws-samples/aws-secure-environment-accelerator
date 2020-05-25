import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import { getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { pascalCase } from 'pascal-case';
import { loadAccounts, getAccountId, Account } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { loadStackOutputs } from '../utils/outputs';
import { FlowLogContainer } from '../common/flow-log-container';
import { VpcProps, VpcStack, Vpc } from '../common/vpc';
import { JsonOutputValue } from '../common/json-output';
import { TransitGateway } from '../common/transit-gateway';
import { loadLimits, Limiter, Limit } from '../utils/limits';
import { NestedStack } from '@aws-cdk/aws-cloudformation';
import {
  InterfaceEndpointConfig,
  PeeringConnectionConfig,
  IamUserConfigType,
  IamConfig,
  IamConfigType,
  IamPolicyConfigType,
} from '@aws-pbmm/common-lambda/lib/config';
import { InterfaceEndpoint } from '../common/interface-endpoints';
import { VpcOutput } from '../deployments/vpc';
import { AccountStacks } from '../common/account-stacks';
import { IamAssets } from '../common/iam-assets';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';
import { SecretsContainer } from '@aws-pbmm/common-cdk/lib/core/secrets-container';
import { Secret } from '@aws-cdk/aws-secretsmanager';
import { createRoleName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import { CentralBucketOutput, LogBucketOutput } from '../deployments/defaults';
import * as centralServices from '../deployments/central-services';
import * as certificates from '../deployments/certificates';
import * as defaults from '../deployments/defaults';
import * as firewall from '../deployments/firewall/cluster';
import * as reports from '../deployments/reports';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

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
async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const outputs = await loadStackOutputs();
  const limits = await loadLimits();
  const limiter = new Limiter(limits);

  const globalOptions = acceleratorConfig['global-options'];

  const mandatoryAccountConfig = acceleratorConfig.getMandatoryAccountConfigs();
  const orgUnits = acceleratorConfig.getOrganizationalUnits();

  const app = new cdk.App();

  const transitGateways = new Map<string, TransitGateway>();

  const flowLogContainers: { [accountKey: string]: FlowLogContainer } = {};

  const accountStacks = new AccountStacks(app, {
    phase: 1,
    accounts,
    context,
  });

  // Find the central bucket in the outputs
  const centralBucket = CentralBucketOutput.getBucket({
    acceleratorPrefix: context.acceleratorPrefix,
    accountStacks,
    config: acceleratorConfig,
    outputs,
  });

  const logAccountKey = globalOptions['central-log-services'].account;
  const logAccountId = getAccountId(accounts, logAccountKey);
  const logBucket = LogBucketOutput.getBucket({
    acceleratorPrefix: context.acceleratorPrefix,
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

  /**
   * Creates IAM Role in source Account and provide assume permisions to target acceleratorExecutionRole
   * @param roleName : Role Name forpeering connection from source to target
   * @param sourceAccount : Source Account Key, Role will be created in this
   * @param accountKey : Target Account Key, Access will be provided to this accout
   */
  const createIamRoleForPCXAcceptence = (roleName: string, sourceAccount: string, targetAccount: string) => {
    const accountStack = accountStacks.getOrCreateAccountStack(sourceAccount);
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

    peeringRole.addToPolicy(
      new iam.PolicyStatement({
        resources: ['*'],
        actions: ['ec2:AcceptVpcPeeringConnection'],
      }),
    );
  };

  // Auxiliary method to create a VPC stack the account with given account key
  // Only one VPC stack per account is created
  const getFlowLogContainer = (accountKey: string): FlowLogContainer => {
    if (flowLogContainers[accountKey]) {
      return flowLogContainers[accountKey];
    }

    const accountBucket = accountBuckets[accountKey];
    if (!accountBucket) {
      throw new Error(`Cannot find default bucket for account ${accountKey}`);
    }

    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);
    const flowLogContainer = new FlowLogContainer(accountStack, `FlowLogContainer`, {
      bucket: accountBucket,
    });
    flowLogContainers[accountKey] = flowLogContainer;
    return flowLogContainer;
  };

  // Auxiliary method to create a VPC in the account with given account key
  const createVpc = (accountKey: string, props: VpcProps): Vpc | undefined => {
    const { vpcConfig } = props;

    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);
    const vpcStackPrettyName = pascalCase(props.vpcConfig.name);

    const vpcStack = new VpcStack(accountStack, `VpcStack${vpcStackPrettyName}`, {
      vpcProps: props,
      transitGateways,
    });
    const vpc = vpcStack.vpc;

    const endpointConfig = vpcConfig['interface-endpoints'];
    if (InterfaceEndpointConfig.is(endpointConfig)) {
      const subnetName = endpointConfig.subnet;
      const subnetIds = vpc.azSubnets.getAzSubnetIdsForSubnetName(subnetName);
      if (!subnetIds) {
        throw new Error(`Cannot find subnet ID with name "${subnetName}'`);
      }

      let endpointCount = 0;
      let endpointStackIndex = 0;
      let endpointStack;
      for (const endpoint of endpointConfig.endpoints) {
        if (endpoint === 'notebook') {
          console.log(`Skipping endpoint "${endpoint}" creation in VPC "${vpc.name}". Endpoint not supported`);
          continue;
        } else if (!limiter.create(accountKey, Limit.VpcInterfaceEndpointsPerVpc, vpc.name)) {
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

    // Enable flow logging if necessary
    const flowLogs = vpcConfig['flow-logs'];
    if (flowLogs) {
      const flowLogContainer = getFlowLogContainer(accountKey);
      const flowLogRole = flowLogContainer.role;

      new ec2.CfnFlowLog(vpcStack, 'FlowLog', {
        deliverLogsPermissionArn: flowLogRole.roleArn,
        resourceId: vpc.vpcId,
        resourceType: 'VPC',
        trafficType: ec2.FlowLogTrafficType.ALL,
        logDestination: flowLogContainer.destination,
        logDestinationType: ec2.FlowLogDestinationType.S3,
      });
    }

    // Prepare the output for next phases
    const vpcOutput: VpcOutput = {
      vpcId: vpc.vpcId,
      vpcName: props.vpcConfig.name,
      cidrBlock: props.vpcConfig.cidr.toCidrString(),
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
    };

    // Store the VPC output so that subsequent phases can access the output
    new JsonOutputValue(vpc, `VpcOutput`, {
      type: 'VpcOutput',
      value: vpcOutput,
    });

    return vpcStack.vpc;
  };

  // Create all the VPCs for accounts and organizational units
  for (const { ouKey, accountKey, vpcConfig, deployments } of acceleratorConfig.getVpcConfigs()) {
    if (!limiter.create(accountKey, Limit.VpcPerRegion)) {
      console.log(
        `Skipping VPC "${vpcConfig.name}" deployment. Reached maximum VPCs per region for account "${accountKey}"`,
      );
      continue;
    }

    console.debug(
      `Deploying VPC "${vpcConfig.name}" in account "${accountKey}"${
        ouKey ? ` and organizational unit "${ouKey}"` : ''
      }`,
    );
    createVpc(accountKey, {
      accountKey,
      limiter,
      accounts,
      vpcConfig,
      tgwDeployment: deployments?.tgw,
      organizationalUnitName: ouKey,
      vpcConfigs: acceleratorConfig.getVpcConfigs(),
    });

    const pcxConfig = vpcConfig.pcx;
    if (PeeringConnectionConfig.is(pcxConfig)) {
      // Create Accepter Role for Peering Connection **WITHOUT** random suffix
      const roleName = createRoleName(`VPC-PCX-${pascalCase(accountKey)}To${pascalCase(pcxConfig.source)}`, 0);
      createIamRoleForPCXAcceptence(roleName, pcxConfig.source, accountKey);
    }
  }

  // Create the firewall
  await firewall.step2({
    accountStacks,
    config: acceleratorConfig,
    outputs,
    transitGateways,
  });

  const getIamPoliciesDefinition = async (): Promise<{ [policyName: string]: string }> => {
    const iamPoliciesDef: { [policyName: string]: string } = {};

    // TODO Remove hard-coded 'master' account key and use configuration file somehow
    const masterAccountId = getAccountId(accounts, 'master');
    const sts = new STS();
    const masterAcctCredentials = await sts.getCredentialsForAccountAndRole(
      masterAccountId,
      context.acceleratorExecutionRoleName,
    );

    const iamPolicyS3 = new S3(masterAcctCredentials);

    const iamPolicyArtifactOutput: IamPolicyArtifactsOutput[] = getStackJsonOutput(outputs, {
      accountKey: 'master',
      outputType: 'IamPolicyArtifactsOutput',
    });

    if (iamPolicyArtifactOutput.length === 0) {
      throw new Error(`Cannot find output with Iam Policy reference artifacts`);
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
              const policyContent = await iamPolicyS3.getObjectBodyAsString({
                Bucket: iamPoliciesBucketName,
                Key: `${iamPoliciesBucketPrefix}${iamPolicyFileName}`,
              });
              iamPoliciesDef[iamPolicyName] = policyContent;
            }
          }
        }
      }
    }

    return iamPoliciesDef;
  };

  // TODO Remove hard-coded 'master' account key and use configuration file somehow
  const masterAccountKey = acceleratorConfig['global-options']['aws-org-master'].account;
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey);
  const secretsStack = new SecretsContainer(masterAccountStack, 'Secrets');

  const iamPoliciesDefinition = await getIamPoliciesDefinition();

  const getUserPasswords = async (accountKey: string, iamConfig?: IamConfig): Promise<{ [userId: string]: Secret }> => {
    const userPasswords: { [userId: string]: Secret } = {};
    const accountId = getAccountId(accounts, accountKey);

    const iamUsers = iamConfig?.users;
    if (iamUsers && iamUsers?.length >= 1) {
      for (const iamUser of iamUsers) {
        if (!IamUserConfigType.is(iamUser)) {
          console.log(
            `IAM config - users is not defined for account with key - ${accountKey}. Skipping Passwords creation.`,
          );
        } else {
          for (const userId of iamUser['user-ids']) {
            const password = secretsStack.createSecret(`${userId}-UserPswd`, {
              secretName: `accelerator/${accountKey}/user/password/${userId}`,
              description: `Password for IAM User - ${userId}.`,
              generateSecretString: {
                passwordLength: 16,
              },
              principals: [new iam.AccountPrincipal(accountId)],
            });
            userPasswords[userId] = password;
          }
        }
      }
    } else {
      console.log(
        `IAM config - users is not defined for account with key - ${accountKey}. Skipping Passwords creation.`,
      );
    }

    return userPasswords;
  };

  const createIamAssets = async (accountKey: string, iamConfig?: IamConfig): Promise<void> => {
    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);

    const userPasswords = await getUserPasswords(accountKey, iamConfig);

    const iamAssets = new IamAssets(accountStack, `IAM Assets-${pascalCase(accountKey)}`, {
      accountKey,
      iamConfig,
      iamPoliciesDefinition,
      accounts,
      userPasswords,
    });
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

  await certificates.step1({
    accountStacks,
    centralBucket: centralBucket,
    config: acceleratorConfig,
  });

  // Central Services step 1
  await centralServices.step2({
    accountStacks,
    config: acceleratorConfig,
    accounts,
  });

  // Cost and usage reports step 1
  await reports.step1({
    accountBuckets,
    accountStacks,
    config: acceleratorConfig,
  });
}

// tslint:disable-next-line: no-floating-promises
main();
