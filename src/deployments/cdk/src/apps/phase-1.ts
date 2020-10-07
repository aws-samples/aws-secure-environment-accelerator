import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import { getStackJsonOutput } from '@aws-accelerator/common-outputs/src/stack-output';
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
} from '@aws-accelerator/common-config';
import { InterfaceEndpoint } from '../common/interface-endpoints';
import { IamAssets } from '../common/iam-assets';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { S3 } from '@aws-accelerator/common/src/aws/s3';
import { createRoleName, createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { CentralBucketOutput, LogBucketOutput } from '../deployments/defaults/outputs';
import * as budget from '../deployments/billing/budget';
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
import * as vpcDeployment from '../deployments/vpc';
import * as transitGateway from '../deployments/transit-gateway';
import { DNS_LOGGING_LOG_GROUP_REGION } from '@aws-accelerator/common/src/util/constants';
import { LogGroup } from '@aws-accelerator/custom-resource-logs-log-group';
import { LogResourcePolicy } from '@aws-accelerator/custom-resource-logs-resource-policy';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import * as centralEndpoints from '../deployments/central-endpoints';

export interface IamPolicyArtifactsOutput {
  bucketArn: string;
  bucketName: string;
  keyPrefix: string;
}

/**
 * This is the main entry point to deploy phase 1.
 * - Create S3 Bucket in all accounts and replicate to Log Account Bucket
 * - Deploy VPC:
 *   - Vpc
 *   - Subnets
 *   - Subnet sharing (RAM)
 *   - Route tables
 *   - Internet gateways
 *   - NAT gateways
 *   - Interface endpoints
 *   - Gateway endpoints
 *   - Transit Gateway Attachments
 *   - IAM Role required for VPC Peering Auto accept
 * - Firewall images subscription check
 * - Creates the customer gateways for the EIPs of the firewall
 * - Create IAM Roles, Users in account based on configuration
 * - Creates the additional budgets for the account stacks.
 * - Import Certificates
 * - Setup SSMSessionManagerDocument
 * - Create Cost and Usage reports
 * - Enable Macie in Master Account
 * - GuardDuty setup in Security Account
 * - Setup CWL Central Logging
 * - Create Roles required for Flow Logs
 * - Transit Gateway Peering
 * - Create LogGroup required for DNS Logging
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

  const { acceleratorName, installerVersion } = context;
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

    // Store the VPC output so that subsequent phases can access the output
    new vpcDeployment.CfnVpcOutput(vpc, `VpcOutput`, {
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
      tgwAttachments: vpc.tgwAVpcAttachments,
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
      installerVersion,
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

    // Creates resolver query logging and associate to the VPC
    await vpcDeployment.step4({
      accountKey,
      accountStacks,
      acceleratorPrefix: context.acceleratorPrefix,
      outputs,
      vpcConfig,
      vpcId: vpc!.id,
    });
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

  // SSM config step 1
  await ssm.step1({
    accountStacks,
    bucketName: logBucket.bucketName,
    config: acceleratorConfig,
    accounts,
    accountBuckets,
    outputs,
  });

  // Cost and usage reports step 1
  await reports.step1({
    accountBuckets,
    accountStacks,
    config: acceleratorConfig,
  });

  // Macie step 1
  await macie.step1({
    accountStacks,
    accounts,
    config: acceleratorConfig,
    outputs,
  });

  await macie.enableMaciePolicy({
    accountBuckets,
    accountStacks,
    accounts,
    config: acceleratorConfig,
    outputs,
  });

  if (!acceleratorConfig['global-options']['alz-baseline']) {
    // GuardDuty step 1
    // to use step1 need this to be fixed: https://t.corp.amazon.com/P36821200/overview
    await guardDutyDeployment.step1({
      accountStacks,
      config: acceleratorConfig,
      accounts,
      outputs,
    });
  }

  // Central Services step 1
  await cwlCentralLoggingToS3.step1({
    accountStacks,
    accounts,
    logBucket,
    outputs,
    config: acceleratorConfig,
  });

  await vpcDeployment.step1({
    accountBuckets,
    accountStacks,
    config: acceleratorConfig,
    accounts,
  });

  await transitGateway.createPeeringAttachment({
    accountStacks,
    accounts,
    config: acceleratorConfig,
    outputs,
  });

  /**
   * Code to create LogGroups required for DNS Logging
   */
  const globalOptionsConfig = acceleratorConfig['global-options'];
  const zoneConfig = globalOptionsConfig.zones.find(zc => zc.names);
  const zonesAccountKey = zoneConfig?.account!;

  const zonesStack = accountStacks.getOrCreateAccountStack(zonesAccountKey, DNS_LOGGING_LOG_GROUP_REGION);
  const logGroupLambdaRoleOutput = IamRoleOutputFinder.tryFindOneByName({
    outputs,
    accountKey: zonesAccountKey,
    roleKey: 'LogGroupRole',
  });
  if (logGroupLambdaRoleOutput) {
    const logGroups =
      zoneConfig?.names?.public.map(phz => {
        const logGroupName = centralEndpoints.createR53LogGroupName({
          acceleratorPrefix: context.acceleratorPrefix,
          domain: phz,
        });
        return new LogGroup(zonesStack, `Route53HostedZoneLogGroup${pascalCase(phz)}`, {
          logGroupName,
          roleArn: logGroupLambdaRoleOutput.roleArn,
        });
      }) || [];

    if (logGroups.length > 0) {
      const wildcardLogGroupName = centralEndpoints.createR53LogGroupName({
        acceleratorPrefix: context.acceleratorPrefix,
        domain: '*',
      });

      // Allow r53 services to write to the log group
      const logGroupPolicy = new LogResourcePolicy(zonesStack, 'R53LogGroupPolicy', {
        policyName: createName({
          name: 'query-logging-pol',
        }),
        policyStatements: [
          new iam.PolicyStatement({
            actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
            principals: [new iam.ServicePrincipal('route53.amazonaws.com')],
            resources: [`arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:${wildcardLogGroupName}`],
          }),
        ],
      });
      for (const logGroup of logGroups) {
        logGroupPolicy.node.addDependency(logGroup);
      }
    }
  }
}
