import * as fs from 'fs';
import path from 'path';
import * as yaml from 'js-yaml';
import _ from 'lodash';
import {
  AcceleratorConfig,
  CertificateConfig,
  GlobalOptionsConfig,
  IamPolicyConfig,
  IamRoleConfig,
  IamUserConfig,
  ImportCertificateConfigType,
  NaclConfig,
  SecurityGroupRuleConfig,
  SecurityGroupSourceConfig,
  SubnetSourceConfig,
  VpcConfig,
} from './asea-config';
import { loadAseaConfig } from './asea-config/load';
import { DynamoDB } from './common/aws/dynamodb';
import { S3 } from './common/aws/s3';
import { Account, getAccountId } from './common/outputs/accounts';
import {
  SubnetAssignedCidr,
  VpcAssignedCidr,
  loadSubnetAssignedCidrs,
  loadVpcAssignedCidrs,
} from './common/outputs/load-assigned-cidrs';
import { StackOutput, findValuesFromOutputs, loadOutputs } from './common/outputs/load-outputs';
import { loadAccounts } from './common/utils/accounts';
import {
  createNaclName,
  createNatGatewayName,
  createSubnetName,
  createTgwAttachName,
  createVpcName,
  subnetsCidrsTableName,
  vpcCidrsTableName,
} from './common/utils/naming';
import { Config } from './config';
import { AccountsConfig, AccountsConfigType } from './config/accounts-config';
import { GlobalConfig } from './config/global-config';
import {
  AssumedByConfig,
  GroupConfig,
  IamConfig,
  ManagedActiveDirectoryConfigType,
  PolicySetConfigType,
  RoleSetConfigType,
  UserConfig,
} from './config/iam-config';
import { NetworkConfig } from './config/network-config';
import { OrganizationConfig, OrganizationConfigType } from './config/organization-config';
import { AwsConfigRule, SecurityConfig } from './config/security-config';

const IAM_POLICY_CONFIG_PATH = 'iam-policy';
const SCP_CONFIG_PATH = 'scp';
const SSM_DOCUMENTS_CONFIG_PATH = 'ssm-documents';
const MAD_CONFIG_SCRIPTS = 'config/scripts';
const LZA_SCP_CONFIG_PATH = 'service-control-policies';
const LZA_MAD_CONFIG_SCRIPTS = 'ad-config-scripts/';

type LzaNaclRuleType = {
  rule: number;
  protocol: number;
  fromPort: number;
  toPort: number;
  action: 'allow' | 'deny';
};
type LzaNaclInboundRuleType = LzaNaclRuleType & {
  source?: string | { account: string; vpc: string; subnet: string; regoin?: string };
};

type LzaNaclOutboundRuleType = LzaNaclRuleType & {
  destination?: string | { account: string; vpc: string; subnet: string; regoin?: string };
};

type SubnetType = {
  name: string;
  availabilityZone: string;
  routeTable: string;
  ipv4CidrBlock: string;
  mapPublicIpOnLaunch?: boolean;
  shareTargets?: { organizationalUnits?: string[]; accounts?: string[] };
};

type SecurityGroupRuleSubnetSource = { account: string; vpc: string; subnets: string[] };

type SecurityGroupRuleSGSource = { securityGroups: string[] };

type SecurityGroupRuleType = {
  description: string;
  types?: string[];
  tcpPorts?: number[];
  udpPorts?: number[];
  fromPort?: number;
  toPort?: number;
  sources: (string | SecurityGroupRuleSubnetSource | SecurityGroupRuleSGSource)[];
};

const SnsFindingTypesDict = {
  Low: 'Low',
  Medium: 'Medium',
  High: 'High',
  Critical: 'High',
  INFORMATIONAL: 'Low',
  None: 'Low',
};

async function writeConfig(filePath: string, config: string) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) fs.mkdirSync(dirname, { recursive: true });
  fs.writeFileSync(filePath, config);
}

export class ConvertAseaConfig {
  private readonly aseaConfigRepositoryName: string;
  private readonly region: string;
  private readonly aseaPrefix: string;
  private readonly centralBucketName: string;
  private readonly parametersTable: string;
  private readonly outputsTable: string;
  private readonly s3: S3;
  private readonly dynamoDb: DynamoDB;
  private accounts: Account[] = [];
  private outputs: StackOutput[] = [];
  private vpcAssignedCidrs: VpcAssignedCidr[] = [];
  private subnetAssignedCidrs: SubnetAssignedCidr[] = [];
  private readonly outputFolder: string;
  private readonly mappingFileBucketName: string;
  private readonly acceleratorName: string;
  constructor(config: Config) {
    this.aseaConfigRepositoryName = config.repositoryName;
    this.region = config.homeRegion;
    this.centralBucketName = config.centralBucket!;
    this.parametersTable = `${config.aseaPrefix}Parameters`;
    this.outputsTable = `${config.aseaPrefix}Outputs`;
    this.aseaPrefix = config.aseaPrefix!;
    this.acceleratorName = config.acceleratorName!;
    this.mappingFileBucketName = config.mappingBucketName!;
    this.s3 = new S3(undefined, this.region);
    this.dynamoDb = new DynamoDB(undefined, this.region);
    this.outputFolder = config.configOutputFolder ?? 'converted';
  }

  async process() {
    const aseaConfig = await loadAseaConfig({
      filePath: 'raw/config.json',
      repositoryName: this.aseaConfigRepositoryName,
      defaultRegion: this.region,
    });
    this.accounts = await loadAccounts(this.parametersTable, this.dynamoDb);
    this.outputs = await loadOutputs(this.outputsTable, this.dynamoDb);
    this.vpcAssignedCidrs = await loadVpcAssignedCidrs(vpcCidrsTableName(this.aseaPrefix), this.dynamoDb);
    this.subnetAssignedCidrs = await loadSubnetAssignedCidrs(subnetsCidrsTableName(this.aseaPrefix), this.dynamoDb);
    await this.prepareGlobalConfig(aseaConfig);
    await this.prepareIamConfig(aseaConfig);
    await this.prepareAccountConfig(aseaConfig);
    await this.prepareOrganizationConfig(aseaConfig);
    await this.prepareSecurityConfig(aseaConfig);
    await this.prepareNetworkConfig(aseaConfig);
  }

  private getAccountKeyforLza(globalOptions: GlobalOptionsConfig, accountKey: string) {
    switch (accountKey) {
      case globalOptions['central-log-services'].account:
        return AccountsConfig.LOG_ARCHIVE_ACCOUNT;
      case globalOptions['central-security-services'].account:
        return AccountsConfig.AUDIT_ACCOUNT;
      case globalOptions['aws-org-management'].account:
        return AccountsConfig.MANAGEMENT_ACCOUNT;
      default:
        return accountKey;
    }
  }

  private async prepareGlobalConfig(aseaConfig: AcceleratorConfig) {
    const globalOptions = aseaConfig['global-options'];
    const centralizeLogging = globalOptions['central-log-services'];
    const costAndUsageReport = globalOptions.reports['cost-and-usage-report'];
    const dynamicLogPartitioning = centralizeLogging['dynamic-s3-log-partitioning'];
    if (dynamicLogPartitioning) {
      // Save dynamic-partitioning/log-filters.json
      await writeConfig(path.join(this.outputFolder, 'dynamic-partitioning', 'log-filters.json'), JSON.stringify(dynamicLogPartitioning));
    }
    const globalConfigAttributes: { [key: string]: unknown } = {
      externalLandingZoneResources: {
        importExternalLandingZoneResources: true,
        acceleratorPrefix: this.aseaPrefix,
        acceleratorName: this.acceleratorName,
        mappingFileBucket: this.mappingFileBucketName,
      },
      homeRegion: this.region,
      enabledRegions: globalOptions['supported-regions'],
      managementAccountAccessRole: globalOptions['organization-admin-role'] || 'OrganizationAccountAccessRole',
      cloudwatchLogRetentionInDays: globalOptions['default-cwl-retention'],
      terminationProtection: true, // TODO: Confirm default
      controlTower: { enable: globalOptions['ct-baseline'] },
      cdkOptions: { centralizeBuckets: true, useManagementAccessRole: false }, // TODO: Config default
      logging: {
        account: this.getAccountKeyforLza(globalOptions, centralizeLogging.account),
        centralizedLoggingRegion: centralizeLogging.region,
        // TODO: Confirm defaults
        cloudtrail: {
          enable: false,
          organizationTrail: false,
          // TODO: Confirm defaults
          organizationTrailSettings: {
            multiRegionTrail: true,
            globalServiceEvents: true,
            managementEvents: true,
            s3DataEvents: true,
            lambdaDataEvents: false,
            sendToCloudWatchLogs: true,
            apiErrorRateInsight: false,
            apiCallRateInsight: true,
          },
          // TODO: Confirm Account trails, ASEA seems like doesn't have any account specific trail config
          // TODO: Confirm about lifecycleRules. Not present in ASEA and not used in LZA
        },
        sessionManager: {
          sendToS3: centralizeLogging['ssm-to-s3'],
          sendToCloudWatchLogs: centralizeLogging['ssm-to-cwl'],
          lifecycleRules: [
            {
              enabled: true,
              abortIncompleteMultipartUpload: 7,
              expiration: 730,
              noncurrentVersionExpiration: 730,
            },
          ],
          // TODO: Confirm about iam roles
          // LZA doesn't have validation of IAM role in account.
          // TODO: Build needs verification attributes list for manual verification
          attachPolicyToIamRoles: ['EC2-Default-SSM-AD-Role'],
        },
        // No option to customize on ASEA apart from expiration/retention
        accessLogBucket: {
          lifecycleRules: [
            {
              enabled: true,
              abortIncompleteMultipartUpload: 7,
              expiration: centralizeLogging['s3-retention'] ?? 730,
              noncurrentVersionExpiration: centralizeLogging['s3-retention'] ?? 730,
            },
          ],
        },
        centralLogBucket: {
          lifecycleRules: [
            {
              enabled: true,
              abortIncompleteMultipartUpload: 7,
              expiration: centralizeLogging['s3-retention'] ?? 730,
              noncurrentVersionExpiration: centralizeLogging['s3-retention'] ?? 730,
            },
          ],
          // No example found for globalConfig.logging.centralLogBucket.s3ResourcePolicyAttachments in any of the configs
          // TODO: Add to manual verification
          // s3ResourcePolicyAttachments: [],
          // No example found for globalConfig.logging.centralLogBucket.kmsResourcePolicyAttachments in any of the configs
          // TODO: Add to manual verification
          // kmsResourcePolicyAttachments: [],
        },
        elbLogBucket: {
          lifecycleRules: [
            {
              enabled: true,
              abortIncompleteMultipartUpload: 7,
              expiration: centralizeLogging['s3-retention'] ?? 730,
              noncurrentVersionExpiration: centralizeLogging['s3-retention'] ?? 730,
            },
          ],
          // No example found for globalConfig.logging.centralLogBucket.s3ResourcePolicyAttachments in any of the configs
          // TODO: Add to manual verification
          // s3ResourcePolicyAttachments: [],
        },
        cloudwatchLogs: {
          enable: true,
          dynamicPartitioning: dynamicLogPartitioning ? 'dynamic-partitioning/log-filters.json' : undefined,
          // No exclusions in ASEA
          // TODO: Add to manual verification
          // exclusions: [],
        },
      },
      reports: {
        costAndUsageReport: {
          additionalSchemaElements: costAndUsageReport['additional-schema-elements'],
          compression: costAndUsageReport.compression,
          format: costAndUsageReport.format,
          reportName: costAndUsageReport['report-name'],
          s3Prefix: costAndUsageReport['s3-prefix'],
          timeUnit: costAndUsageReport['time-unit'],
          additionalArtifacts: costAndUsageReport['additional-artifacts'],
          refreshClosedReports: costAndUsageReport['refresh-closed-reports'],
          reportVersioning: costAndUsageReport['report-versioning'],
        },
        budgets: this.buildBudgets(aseaConfig),
      },
      // No backup vaults in ASEA
      // TODO: Add to manual verification
      // backup: { vaults: [] }
      snsTopics: this.buildSnsTopics(aseaConfig),
      limits: this.buildLimits(aseaConfig),
      // No acceleratorMetadata in ASEA
      // TODO: Add to manual verification
      // acceleratorMetadata: {},
      ssmInventory: this.buildSsmInventory(aseaConfig),
    };

    const globalConfig = GlobalConfig.fromObject(globalConfigAttributes);
    const yamlConfig = yaml.dump(globalConfig);
    await writeConfig(path.join(this.outputFolder, GlobalConfig.FILENAME), yamlConfig);
  }

  private buildBudgets(aseaConfig: AcceleratorConfig) {
    enum CostTypes {
      CREDIT = 'Credits',
      DISCOUNT = 'Discounts',
      OTHER = 'Other-subscription-costs',
      RECURRING = 'Recurring-reservation-charges',
      REFUND = 'Refunds',
      SUBSCRIPTION = 'Subscription',
      SUPPORT = 'Support-charges',
      TAX = 'Taxes',
      UPFRONT = 'Upfront-reservation-fees',
      AMORTIZED = 'Amortized',
      BLENDED = 'Blended',
    }
    const budgets: unknown[] = [];
    const budgetCreatedToAccounts: string[] = [];
    aseaConfig.getAccountConfigs().forEach(([accountKey, accountConfig]) => {
      if (!accountConfig.budget) return;
      const budget = accountConfig.budget;
      budgets.push({
        name: budget.name,
        amount: budget.amount,
        type: 'USAGE', // TODO: Confirm default
        timeUnit: 'MONTHLY', // TODO: Confirm default
        unit: 'USD', // Set by ASEA
        includeUpfront: budget.include.includes(CostTypes.UPFRONT),
        includeTax: budget.include.includes(CostTypes.TAX),
        includeSupport: budget.include.includes(CostTypes.SUPPORT),
        includeSubscription: budget.include.includes(CostTypes.SUBSCRIPTION),
        includeRecurring: budget.include.includes(CostTypes.RECURRING),
        includeOtherSubscription: budget.include.includes(CostTypes.OTHER),
        includeDiscount: budget.include.includes(CostTypes.DISCOUNT),
        includeCredit: budget.include.includes(CostTypes.CREDIT),
        includeRefund: budget.include.includes(CostTypes.REFUND),
        useBlended: budget.include.includes(CostTypes.BLENDED),
        useAmortized: budget.include.includes(CostTypes.AMORTIZED),
        notifications: budget.alerts.map((alert) => ({
          type: alert.type === 'Actual' ? 'ACTUAL' : 'FORECASTED',
          thresholdType: 'PERCENTAGE',
          comparisonOperator: 'GREATER_THAN',
          threshold: alert['threshold-percent'],
          address: alert.emails[0], // TODO: Confirm about using only zero index. ASEA Code supports multiple subscriber emails
          subscriptionType: 'EMAIL',
        })),
        deploymentTargets: {
          accounts: [this.getAccountKeyforLza(aseaConfig['global-options'], accountKey)], // TODO: Confirm about using accountKey for LZA
        },
      });
      budgetCreatedToAccounts.push(this.getAccountKeyforLza(aseaConfig['global-options'], accountKey));
    });

    Object.entries(aseaConfig['organizational-units']).forEach(([ouName, ouConfig]) => {
      if (!ouConfig['default-budgets']) return;
      const budget = ouConfig['default-budgets'];
      budgets.push({
        name: budget.name,
        amount: budget.amount,
        type: 'USAGE', // TODO: Confirm default
        timeUnit: 'MONTHLY', // TODO: Confirm default
        unit: 'USD', // Set by ASEA
        includeUpfront: budget.include.includes(CostTypes.UPFRONT),
        includeTax: budget.include.includes(CostTypes.TAX),
        includeSupport: budget.include.includes(CostTypes.SUPPORT),
        includeSubscription: budget.include.includes(CostTypes.SUBSCRIPTION),
        includeRecurring: budget.include.includes(CostTypes.RECURRING),
        includeOtherSubscription: budget.include.includes(CostTypes.OTHER),
        includeDiscount: budget.include.includes(CostTypes.DISCOUNT),
        includeCredit: budget.include.includes(CostTypes.CREDIT),
        includeRefund: budget.include.includes(CostTypes.REFUND),
        useBlended: budget.include.includes(CostTypes.BLENDED),
        useAmortized: budget.include.includes(CostTypes.AMORTIZED),
        notifications: budget.alerts.map((alert) => ({
          type: alert.type === 'Actual' ? 'ACTUAL' : 'FORECASTED',
          thresholdType: 'PERCENTAGE',
          comparisonOperator: 'GREATER_THAN',
          threshold: alert['threshold-percent'],
          address: alert.emails[0], // TODO: Confirm about using only zero index. ASEA Code supports multiple subscriber emails
          subscriptionType: 'EMAIL',
        })),
        deploymentTargets: {
          organizationalUnits: [ouName], // TODO: Confirm about using ouName for LZA
          excludedAccounts: budgetCreatedToAccounts,
        },
      });
    });
    return budgets;
  }

  private buildSnsTopics(aseaConfig: AcceleratorConfig) {
    if (!aseaConfig['global-options']['central-log-services']['sns-subscription-emails']) return;
    return {
      // Set deploymentTargets to Root Org since we need sns topics in all accounts
      deploymentTargets: { organizationalUnits: ['Root'] },
      topics: [
        ...Object.entries(aseaConfig['global-options']['central-log-services']['sns-subscription-emails']).map(
          ([notificationType, emailAddresses]) => ({
            name: `${this.aseaPrefix}Notification-${notificationType}`,
            emailAddresses,
          }),
        ),
        {
          // ASEA creates SNS Topic for Ignore and used with alarms
          name: `${this.aseaPrefix}Notification-Ignore`,
          // Using Low email to ignore error with LZA config validation. ASEA creates Lambda function and use as subscriber
          emailAddresses: aseaConfig['global-options']['central-log-services']['sns-subscription-emails'].Low ?? [],
        },
      ],
    };
  }

  private buildLimits(aseaConfig: AcceleratorConfig) {
    interface LimitCode {
      serviceCode: string;
      quotaCode: string;
      enabled: boolean;
    }
    enum Limit {
      Ec2Eips = 'Amazon EC2/Number of EIPs',
      VpcPerRegion = 'Amazon VPC/VPCs per Region',
      VpcInterfaceEndpointsPerVpc = 'Amazon VPC/Interface VPC endpoints per VPC',
      CloudFormationStackCount = 'AWS CloudFormation/Stack count',
      CloudFormationStackSetPerAdmin = 'AWS CloudFormation/Stack sets per administrator account',
      OrganizationsMaximumAccounts = 'AWS Organizations/Maximum accounts',
      CloudWatchCreateLogStream = 'AWS CloudWatch Logs/CreateLogStream throttle limit in transactions per second',
      LambdaConcurrentExecutions = 'AWS Lambda/Concurrent Executions',
    }
    const LIMITS: { [limitKey: string]: LimitCode } = {
      [Limit.Ec2Eips]: {
        serviceCode: 'ec2',
        quotaCode: 'L-0263D0A3',
        enabled: true,
      },
      [Limit.VpcPerRegion]: {
        serviceCode: 'vpc',
        quotaCode: 'L-F678F1CE',
        enabled: true,
      },
      [Limit.VpcInterfaceEndpointsPerVpc]: {
        serviceCode: 'vpc',
        quotaCode: 'L-29B6F2EB',
        enabled: true,
      },
      [Limit.CloudFormationStackCount]: {
        serviceCode: 'cloudformation',
        quotaCode: 'L-0485CB21',
        enabled: true,
      },
      [Limit.CloudFormationStackSetPerAdmin]: {
        serviceCode: 'cloudformation',
        quotaCode: 'L-EC62D81A',
        enabled: true,
      },
      [Limit.OrganizationsMaximumAccounts]: {
        serviceCode: 'organizations',
        quotaCode: 'L-29A0C5DF',
        enabled: false,
      },
      [Limit.CloudWatchCreateLogStream]: {
        serviceCode: 'logs',
        quotaCode: 'L-76507CEF',
        enabled: true,
      },
      [Limit.LambdaConcurrentExecutions]: {
        serviceCode: 'lambda',
        quotaCode: 'L-B99A9384',
        enabled: true,
      },
    };
    const updatedLimitConfig: unknown[] = [];
    aseaConfig.getAccountConfigs().forEach(([accountKey, accountConfig]) => {
      if (!accountConfig.limits) return;
      Object.entries(accountConfig.limits).forEach(([limitKey, limitConfig]) => {
        updatedLimitConfig.push({
          serviceCode: LIMITS[limitKey].serviceCode,
          quotaCode: LIMITS[limitKey].quotaCode,
          desiredValue: limitConfig.value,
          deploymentTargets: {
            accounts: [this.getAccountKeyforLza(aseaConfig['global-options'], accountKey)],
          },
        });
      });
    });
    return updatedLimitConfig;
  }

  private buildSsmInventory(aseaConfig: AcceleratorConfig) {
    const ssmInventoryAccounts = aseaConfig
      .getAccountConfigs()
      .filter(([_accountKey, accountConfig]) => !!accountConfig['ssm-inventory-collection'])
      .map(([accountKey]) => this.getAccountKeyforLza(aseaConfig['global-options'], accountKey));
    const ssmInventoryOus = Object.entries(aseaConfig['organizational-units'])
      .filter(([_accountKey, ouConfig]) => !!ouConfig['ssm-inventory-collection'])
      .map(([ouKey]) => ouKey);
    if (ssmInventoryAccounts.length === 0 || ssmInventoryOus.length === 0) return;
    return {
      enable: true,
      deploymentTargets: {
        organizationalUnits: ssmInventoryOus,
        accounts: ssmInventoryAccounts,
      },
    };
  }

  /**
   * Converts ASEA iam config to LZA IAM Config
   * ASEA doesn't have identityCenter configuration
   * @param aseaConfig
   */
  private async prepareIamConfig(aseaConfig: AcceleratorConfig) {
    const iamConfigAttributes: { [key: string]: unknown } = {};
    const roleSets: RoleSetConfigType[] = [];
    const userSets: unknown[] = [];
    const groupSets: unknown[] = [];
    const madConfigs: ManagedActiveDirectoryConfigType[] = [];
    const policySets: PolicySetConfigType[] = [];
    const getPolicyConfig = async (policy: IamPolicyConfig, ouKey?: string, accountKey?: string) => {
      const currentIndex = policySets.findIndex((ps) => ps.policies.find((p) => p.name === policy['policy-name']));
      if (currentIndex === -1) {
        const policyData = await this.s3.getObjectBodyAsString({
          Bucket: this.centralBucketName,
          Key: path.join(IAM_POLICY_CONFIG_PATH, policy.policy),
        });
        const newFileName = path.join(
          IAM_POLICY_CONFIG_PATH,
          `${policy.policy.split('.').slice(0, -1).join('.')}.json`,
        );
        await writeConfig(path.join(this.outputFolder, newFileName), policyData);
        policySets.push({
          deploymentTargets: {
            accounts: accountKey ? [accountKey] : [],
            organizationalUnits: ouKey ? [ouKey] : [],
            excludedAccounts: undefined,
            excludedRegions: undefined,
          },
          policies: [
            {
              name: policy['policy-name'],
              policy: newFileName,
            },
          ],
        });
        return;
      }
      if (accountKey) policySets[currentIndex].deploymentTargets.accounts?.push(accountKey);
      if (ouKey) policySets[currentIndex].deploymentTargets.organizationalUnits?.push(ouKey);
    };

    const getRoleConfig = async ({
      role,
      accountKey,
      existingCustomerManagerPolicies,
      ouKey,
    }: {
      role: IamRoleConfig;
      existingCustomerManagerPolicies?: string[];
      accountKey?: string;
      ouKey?: string;
    }) => {
      const currentIndex = roleSets.findIndex((rs) => rs.roles.find((r) => r.name === role.role));
      if (currentIndex === -1) {
        const assumedBy: AssumedByConfig[] = [];
        if (!!role['source-account'] && !!role['source-account-role']) {
          assumedBy.push({
            type: 'account',
            principal: `arn:aws:iam::${getAccountId(this.accounts, role['source-account'])}:role/${
              role['source-account-role']
            }`,
          });
        }
        if (role.type !== 'account') {
          // If type is not account, consider type as service
          assumedBy.push({
            type: 'service',
            principal: `${role.type}.amazonaws.com`,
          });
        }
        roleSets.push({
          deploymentTargets: {
            accounts: accountKey ? [accountKey] : [],
            excludedAccounts: undefined,
            excludedRegions: undefined,
            organizationalUnits: ouKey ? [ouKey] : [],
          },
          path: undefined,
          roles: [
            {
              assumedBy,
              boundaryPolicy: role['boundary-policy'],
              name: role.role,
              policies: {
                awsManaged: role.policies.filter((policy) => !(existingCustomerManagerPolicies || []).includes(policy)),
                customerManaged: role.policies.filter((policy) =>
                  (existingCustomerManagerPolicies || []).includes(policy),
                ),
              },
              instanceProfile: role.type === 'ec2',
            },
          ],
        });
        return;
      }
      if (accountKey) roleSets[currentIndex].deploymentTargets.accounts?.push(accountKey);
      if (ouKey) roleSets[currentIndex].deploymentTargets.organizationalUnits?.push(ouKey);
    };

    const getUserConfig = async (users: IamUserConfig[]) => {
      const lzaGroupConfig: GroupConfig[] = [];
      const lzaUserConfig: UserConfig[] = [];
      for (const user of users) {
        // ASEA creates one user per userId and LZA accepts username param directly
        lzaUserConfig.push(
          ...user['user-ids'].map((userId) => ({
            group: user.group,
            boundaryPolicy: user['boundary-policy'],
            username: userId,
          })),
        );
        /**
         * ASEA creates one group for each user using name given and policies provided in user config
         * ASEA only adds managedPolicies
         * ``` from ASEA group creation code
         * managedPolicies: policies.map(x => iam.ManagedPolicy.fromAwsManagedPolicyName(x)),
         * ```
         */
        lzaGroupConfig.push({
          name: user.group,
          policies: {
            awsManaged: user.policies,
            customerManaged: [],
          },
        });
      }
      return { users: lzaUserConfig, groups: lzaGroupConfig };
    };

    const madSharedTo = (accountKey: string) => {
      const sharedAccounts: string[] = [];
      const sharedOrganizationalUnits: string[] = [];
      aseaConfig.getAccountConfigs().forEach(([localAccountKey, accountConfig]) => {
        if (accountConfig['share-mad-from'] === accountKey) {
          sharedAccounts.push(this.getAccountKeyforLza(aseaConfig['global-options'], localAccountKey));
        }
      });
      Object.entries(aseaConfig['organizational-units']).forEach(([ouKey, ouConfig]) => {
        if (ouConfig['share-mad-from'] === accountKey) {
          sharedOrganizationalUnits.push(ouKey);
        }
      });
      return { sharedAccounts, sharedOrganizationalUnits };
    };

    // Read VPCs here to reuse when needed
    const vpcConfigs = aseaConfig.getVpcConfigs();
    let userDataScriptsCopied = false;
    for (const [accountKey, accountConfig] of aseaConfig.getAccountConfigs()) {
      const customerManagedPolicies = aseaConfig.getCustomerManagedPoliciesByAccount(accountKey);
      for (const policy of accountConfig.iam?.policies || []) {
        await getPolicyConfig(policy, undefined, this.getAccountKeyforLza(aseaConfig['global-options'], accountKey));
      }
      for (const role of accountConfig.iam?.roles || []) {
        await getRoleConfig({
          role,
          accountKey: this.getAccountKeyforLza(aseaConfig['global-options'], accountKey),
          existingCustomerManagerPolicies: customerManagedPolicies,
        });
      }
      if (accountConfig.iam?.users && accountConfig.iam?.users?.length > 0) {
        const { users, groups } = await getUserConfig(accountConfig.iam.users);
        userSets.push({
          deploymentTargets: {
            accounts: [this.getAccountKeyforLza(aseaConfig['global-options'], accountKey)],
          },
          users,
        });
        groupSets.push({
          deploymentTargets: {
            accounts: [this.getAccountKeyforLza(aseaConfig['global-options'], accountKey)],
          },
          groups,
        });
      }
      // MAD is only present in AccountConfig
      if (accountConfig.deployments?.mad) {
        const aseaMadConfig = accountConfig.deployments.mad;
        const passwordPolicy = aseaMadConfig['password-policies'];
        const userDataScripts = [
          {
            scriptName: 'JoinDomain',
            scriptFilePath: `${LZA_MAD_CONFIG_SCRIPTS}Join-Domain.ps1`,
          },
          {
            scriptName: 'AWSQuickStart',
            scriptFilePath: `${LZA_MAD_CONFIG_SCRIPTS}AWSQuickStart.psm1`,
          },
          {
            scriptName: 'InitializeRDGW',
            scriptFilePath: `${LZA_MAD_CONFIG_SCRIPTS}Initialize-RDGW.ps1`,
          },
          {
            scriptName: 'ADGroupSetup',
            scriptFilePath: `${LZA_MAD_CONFIG_SCRIPTS}AD-group-setup.ps1`,
          },
          {
            scriptName: 'ADUserSetup',
            scriptFilePath: `${LZA_MAD_CONFIG_SCRIPTS}AD-user-setup.ps1`,
          },
          {
            scriptName: 'ADUserGroupSetup',
            scriptFilePath: `${LZA_MAD_CONFIG_SCRIPTS}AD-user-group-setup.ps1`,
          },
          {
            scriptName: 'ADGroupGrantPermissionsSetup',
            scriptFilePath: `${LZA_MAD_CONFIG_SCRIPTS}AD-group-grant-permissions-setup.ps1`,
          },
          {
            scriptName: 'ADConnectorPermissionsSetup',
            scriptFilePath: `${LZA_MAD_CONFIG_SCRIPTS}AD-connector-permissions-setup.ps1`,
          },
          {
            scriptName: 'ConfigurePasswordPolicy',
            scriptFilePath: `${LZA_MAD_CONFIG_SCRIPTS}Configure-password-policy.ps1`,
          },
        ];
        if (!userDataScriptsCopied) {
          for (const userData of userDataScripts) {
            const content = await this.s3.getObjectBodyAsString({
              Bucket: this.centralBucketName,
              Key: path.join(MAD_CONFIG_SCRIPTS, userData.scriptFilePath.split(LZA_MAD_CONFIG_SCRIPTS)[1]),
            });
            await writeConfig(path.join(this.outputFolder, userData.scriptFilePath), content);
          }
        }
        const vpc = vpcConfigs
          // Filter VPC by name and region
          .filter(
            ({ vpcConfig }) =>
              vpcConfig.name === aseaMadConfig['vpc-name'] && vpcConfig.region === aseaMadConfig.region,
          )
          // Get VPC which is shared to mad deployment account by verifying share in subnet
          .find(({ vpcConfig, ouKey, accountKey: vpcAccountKey }) =>
            vpcConfig.subnets?.find(
              (subnet) =>
                subnet.name === aseaMadConfig.subnet &&
                (vpcAccountKey === accountKey ||
                  subnet['share-to-specific-accounts']?.includes(accountKey) ||
                  (subnet['share-to-ou-accounts'] && !!ouKey && ouKey === accountConfig.ou)),
            ),
          );
        const subnet = vpc?.vpcConfig.subnets?.find((s) => s.name === aseaMadConfig.subnet);
        if (!subnet) {
          throw new Error('Subnet not found in shared config');
        }
        const madSubnetNames = subnet?.definitions
          .filter((s) => !s.disabled)
          // Subnets in ASEA are named as ${subnetName}_${vpcName}_az${subnetDefinition.az}_net
          .map((s) => createSubnetName(aseaMadConfig['vpc-name'], subnet.name, s.az));
        // LZA creates securityGroup using only inboundSources
        const sgInbound = aseaMadConfig['security-groups']
          .filter((sg) => !!sg['inbound-rules'].find((ib) => ib.type?.includes('RDP') || ib.type?.includes('HTTPS')))
          .flatMap((sg) => sg['inbound-rules'].flatMap((ib) => ib.source)) as string[];
        const { sharedAccounts, sharedOrganizationalUnits } = madSharedTo(accountKey);
        const madConfig: ManagedActiveDirectoryConfigType = {
          account: this.getAccountKeyforLza(aseaConfig['global-options'], accountKey),
          description: aseaMadConfig.description,
          name: aseaMadConfig['dns-domain'],
          region: aseaMadConfig.region as any,
          netBiosDomainName: aseaMadConfig['netbios-domain'],
          edition: aseaMadConfig.size,
          dnsName: aseaMadConfig['dns-domain'],
          vpcSettings: {
            vpcName: aseaMadConfig['vpc-name'],
            subnets: madSubnetNames,
          },
          logs: {
            groupName: aseaMadConfig['log-group-name'],
            retentionInDays: undefined,
          },
          activeDirectoryConfigurationInstance: {
            instanceRole: aseaMadConfig['rdgw-instance-role'],
            instanceType: aseaMadConfig['rdgw-instance-type'],
            vpcName: aseaMadConfig['vpc-name'],
            imagePath: aseaMadConfig['image-path'],
            adGroups: aseaMadConfig['ad-groups'],
            adPerAccountGroups: aseaMadConfig['ad-per-account-groups'],
            adConnectorGroup: aseaMadConfig['adc-group'],
            adPasswordPolicy: {
              complexity: passwordPolicy.complexity,
              failedAttempts: passwordPolicy['failed-attempts'],
              history: passwordPolicy.history,
              lockoutAttemptsReset: passwordPolicy['lockout-attempts-reset'],
              lockoutDuration: passwordPolicy['lockout-duration'],
              maximumAge: passwordPolicy['max-age'],
              minimumAge: passwordPolicy['min-age'],
              minimumLength: passwordPolicy['min-len'],
              reversible: passwordPolicy.reversible,
            },
            adUsers: aseaMadConfig['ad-users'].map(({ email, groups, user }) => ({
              email,
              groups,
              name: user,
            })),
            enableTerminationProtection: false,
            userDataScripts,
            subnetName: madSubnetNames[0],
            securityGroupInboundSources: sgInbound,
          },
          /**
           * TODO: Confirm about creating new Resolver rule. Since Instance is new.
           * If can't create new retrieve from outputs.
           * TODO: Work after network config
           */
          resolverRuleName: 'test',
          secretConfig: {
            account: AccountsConfig.AUDIT_ACCOUNT,
            adminSecretName: 'my-admin-001',
            region: aseaMadConfig.region as any,
          },
          sharedAccounts,
          sharedOrganizationalUnits: {
            organizationalUnits: sharedOrganizationalUnits,
            excludedAccounts: [],
          },
        };
        madConfigs.push(madConfig);
      }
    }
    for (const [ouKey, ouConfig] of Object.entries(aseaConfig['organizational-units'])) {
      for (const policy of ouConfig.iam?.policies || []) {
        await getPolicyConfig(policy, ouKey);
      }
      for (const role of ouConfig.iam?.roles || []) {
        // ouConfig.iam?.policies?.map((p) => p['policy-name']) || []
        await getRoleConfig({
          role,
          existingCustomerManagerPolicies: ouConfig.iam?.policies?.map((p) => p['policy-name']) || [],
          ouKey,
        });
      }
      if (ouConfig.iam?.users && ouConfig.iam?.users.length > 0) {
        const { users, groups } = await getUserConfig(ouConfig.iam.users);
        userSets.push({
          deploymentTargets: {
            organizationalUnits: [ouKey],
          },
          users,
        });
        groupSets.push({
          deploymentTargets: {
            organizationalUnits: [ouKey],
          },
          groups,
        });
      }
    }
    iamConfigAttributes.policySets = policySets;
    iamConfigAttributes.roleSets = roleSets;
    iamConfigAttributes.userSets = userSets;
    iamConfigAttributes.groupSets = groupSets;
    iamConfigAttributes.managedActiveDirectories = madConfigs;
    const iamConfig = IamConfig.fromObject(iamConfigAttributes);
    const yamlConfig = yaml.dump(iamConfig);
    await writeConfig(path.join(this.outputFolder, IamConfig.FILENAME), yamlConfig);
  }

  /**
   * Converts ASEA mandatory and workload accounts config to LZA account Config
   * @param aseaConfig
   */
  private async prepareAccountConfig(aseaConfig: AcceleratorConfig) {
    const accountsConfig: AccountsConfigType = {
      mandatoryAccounts: [],
      accountIds: [],
      workloadAccounts: [],
    };
    Object.entries(aseaConfig['mandatory-account-configs']).forEach(([accountKey, accountConfig]) => {
      accountsConfig.mandatoryAccounts.push({
        name: this.getAccountKeyforLza(aseaConfig['global-options'], accountKey),
        description: accountConfig.description,
        email: accountConfig.email,
        organizationalUnit: accountConfig.ou,
        warm: accountConfig['account-warming-required'],
      });
    });
    Object.entries(aseaConfig['workload-account-configs']).forEach(([accountKey, accountConfig]) => {
      accountsConfig.workloadAccounts.push({
        name: accountKey,
        description: accountConfig.description,
        email: accountConfig.email,
        organizationalUnit: accountConfig.ou,
        warm: accountConfig['account-warming-required'],
      });
    });

    const yamlConfig = yaml.dump(accountsConfig);
    await writeConfig(path.join(this.outputFolder, AccountsConfig.FILENAME), yamlConfig);
  }

  /**
   * Converts ASEA organization units and scps into LZA organizational configuration
   * @param aseaConfig
   */
  private async prepareOrganizationConfig(aseaConfig: AcceleratorConfig) {
    const organizationConfig: OrganizationConfigType = {
      enable: !aseaConfig['global-options']['ct-baseline'],
      backupPolicies: [],
      organizationalUnitIds: [],
      organizationalUnits: [],
      serviceControlPolicies: [],
      taggingPolicies: [],
      quarantineNewAccounts: {
        enable: true,
        scpPolicyName: `${this.aseaPrefix}Quarantine-New-Object`,
      },
    };
    Object.entries(aseaConfig['organizational-units']).forEach(([ouKey]) => {
      organizationConfig.organizationalUnits.push({
        name: ouKey,
        ignore: undefined,
      });
    });
    // ASEA Creates Suspended OU and ignores accounts under Suspended OU
    if (!organizationConfig.organizationalUnits.find((ou) => ou.name === 'Suspended')) {
      organizationConfig.organizationalUnits.push({
        name: 'Suspended',
        ignore: true,
      });
    }
    let quarantineScpPresent = false;
    for (const scp of aseaConfig['global-options'].scps) {
      if (scp.name === 'Quarantine-New-Object') {
        quarantineScpPresent = true;
      }
      const accountsDeployedTo = aseaConfig
        .getAccountConfigs()
        .filter(([_accountKey, accountConfig]) => accountConfig.scps?.includes(scp.name))
        .map(([accountKey]) => this.getAccountKeyforLza(aseaConfig['global-options'], accountKey));
      const organizationsDeployedTo = Object.entries(aseaConfig['organizational-units'])
        .filter(([_accountKey, ouConfig]) => ouConfig.scps?.includes(scp.name))
        .map(([ouKey]) => ouKey);
      const policyData = await this.s3.getObjectBodyAsString({
        Bucket: this.centralBucketName,
        Key: path.join(SCP_CONFIG_PATH, scp.policy),
      });
      await writeConfig(path.join(this.outputFolder, LZA_SCP_CONFIG_PATH, scp.policy), policyData);
      organizationConfig.serviceControlPolicies.push({
        name: `${this.aseaPrefix}${scp.name}`,
        description: scp.description,
        type: 'customerManaged', // All ASEA SCPs are customer managed.
        deploymentTargets: {
          accounts: accountsDeployedTo,
          excludedAccounts: [],
          excludedRegions: [],
          organizationalUnits: organizationsDeployedTo,
        },
        policy: path.join(LZA_SCP_CONFIG_PATH, scp.policy),
        strategy: undefined,
      });
    }
    if (!quarantineScpPresent) {
      const quarantineScpContent = JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'DenyAllAWSServicesExceptBreakglassRoles',
            Effect: 'Deny',
            Action: '*',
            Resource: '*',
            Condition: {
              ArnNotLike: {
                'aws:PrincipalARN': [
                  `arn:aws:iam::*:role/${
                    aseaConfig['global-options']['organization-admin-role'] || 'AWSCloudFormationStackSetExecutionRole'
                  }`,
                  `arn:aws:iam::*:role/${this.aseaPrefix}*`,
                  'arn:aws:iam::*:role/aws*',
                ],
              },
            },
          },
        ],
      });
      const quarantineScpName = `${this.aseaPrefix}Quarantine-New-Object`;
      await writeConfig(path.join(this.outputFolder, LZA_SCP_CONFIG_PATH, `${quarantineScpName}.json`), quarantineScpContent);
      organizationConfig.serviceControlPolicies.push({
        name: quarantineScpName,
        description: 'Quarantine policy - Apply to ACCOUNTS that need to be quarantined',
        type: 'customerManaged', // All ASEA SCPs are customer managed.
        deploymentTargets: {
          accounts: [],
          excludedAccounts: [],
          excludedRegions: [],
          organizationalUnits: [],
        },
        policy: path.join(LZA_SCP_CONFIG_PATH, `${quarantineScpName}.json`),
        strategy: undefined,
      });
    }

    const yamlConfig = yaml.dump(organizationConfig);
    await writeConfig(path.join(this.outputFolder, OrganizationConfig.FILENAME), yamlConfig);
  }

  async prepareSecurityConfig(aseaConfig: AcceleratorConfig) {
    const globalOptions = aseaConfig['global-options'];
    // Central Security Services
    const centralSecurityConfig = globalOptions['central-security-services'];
    const accountsConfig = aseaConfig.getAccountConfigs();
    const organizationalUnits = Object.entries(aseaConfig['organizational-units']);
    const securityConfigAttributes: { [key: string]: any } = {
      accessAnalyzer: { enable: true },
      iamPasswordPolicy: {
        allowUsersToChangePassword: globalOptions['iam-password-policies']?.['allow-users-to-change-password'] || false,
        hardExpiry: globalOptions['iam-password-policies']?.['hard-expiry'] || true,
        requireUppercaseCharacters: globalOptions['iam-password-policies']?.['require-uppercase-characters'] || true,
        requireLowercaseCharacters: globalOptions['iam-password-policies']?.['require-lowercase-characters'] || true,
        requireSymbols: globalOptions['iam-password-policies']?.['require-symbols'] || true,
        requireNumbers: globalOptions['iam-password-policies']?.['require-numbers'] || true,
        minimumPasswordLength: globalOptions['iam-password-policies']?.['minimum-password-length'] || 14,
        passwordReusePrevention: globalOptions['iam-password-policies']?.['password-reuse-prevention'] || 24,
        maxPasswordAge:
          globalOptions['iam-password-policies']?.['max-password-age'] || 90,
      },
      cloudWatch: {
        metricSets: [],
        alarmSets: [],
      },
      awsConfig: {
        enableConfigurationRecorder: true,
        enableDeliveryChannel: true,
        overrideExisting: true,
        ruleSets: [],
      },
      centralSecurityServices: {
        delegatedAdminAccount: this.getAccountKeyforLza(globalOptions, centralSecurityConfig.account),
        s3PublicAccessBlock: {
          enable: true,
          excludeAccounts: accountsConfig
            .filter(([_accountKey, accountConfig]) => accountConfig['enable-s3-public-access'])
            .map(([accountKey]) => this.getAccountKeyforLza(globalOptions, accountKey)),
        },
        scpRevertChangesConfig: {
          enable: true,
        },
        auditManager: {
          enable: true,
          defaultReportsConfiguration: {
            enable: true,
            destinationType: 'S3',
          },
        },
        detective: {
          enable: true,
        },
      },
    };
    const ssmDocumentSharedTo = (documentName: string) => {
      const sharedAccounts: string[] = [];
      const sharedOrganizationalUnits: string[] = [];
      aseaConfig.getAccountConfigs().forEach(([accountKey, accountConfig]) => {
        if (!accountConfig['ssm-automation']) return;
        if (accountConfig['ssm-automation'].find((ssm) => ssm.documents.find((d) => d === documentName))) {
          sharedAccounts.push(this.getAccountKeyforLza(globalOptions, accountKey));
        }
      });
      Object.entries(aseaConfig['organizational-units']).forEach(([ouKey, ouConfig]) => {
        if (!ouConfig['ssm-automation']) return;
        if (ouConfig['ssm-automation'].find((ssm) => ssm.documents.find((d) => d === documentName))) {
          sharedOrganizationalUnits.push(ouKey);
        }
      });
      return {
        accounts: sharedAccounts,
        organizationalUnits: sharedOrganizationalUnits,
      };
    };
    const setGuarddutyConfig = async () => {
      if (!centralSecurityConfig.guardduty) return;
      securityConfigAttributes.centralSecurityServices.guardduty = {
        enable: centralSecurityConfig.guardduty,
        excludeRegions: centralSecurityConfig['guardduty-excl-regions'],
        s3Protection: {
          enable: centralSecurityConfig['guardduty-s3'],
          excludeRegions: centralSecurityConfig['guardduty-s3-excl-regions'],
        },
        eksProtection: {
          enable: centralSecurityConfig['guardduty-s3'],
          excludeRegions: centralSecurityConfig['guardduty-s3-excl-regions'],
        },
        exportConfiguration: {
          enable: true,
          destinationType: 'S3',
          exportFrequency: centralSecurityConfig['guardduty-frequency'],
        },
      };
    };
    const setMacieConfig = async () => {
      if (!centralSecurityConfig.macie) return;
      securityConfigAttributes.centralSecurityServices.macie = {
        enable: centralSecurityConfig.macie,
        excludeRegions: centralSecurityConfig['macie-excl-regions'],
        policyFindingsPublishingFrequency: centralSecurityConfig['macie-frequency'],
        publishSensitiveDataFindings: centralSecurityConfig['macie-sensitive-sh'],
      };
    };
    const setSecurityhubConfig = async () => {
      if (!centralSecurityConfig['security-hub']) return;
      securityConfigAttributes.centralSecurityServices.securityHub = {
        enable: true,
        regionAggregation: true,
        snsTopicName: `${this.aseaPrefix}Notification-${
          SnsFindingTypesDict[centralSecurityConfig['security-hub-findings-sns']]
        }`,
        excludeRegions: centralSecurityConfig['security-hub-excl-regions'],
        notificationLevel: centralSecurityConfig['security-hub-findings-sns'].toUpperCase(),
        standards: globalOptions['security-hub-frameworks'].standards.map((sh) => ({
          name: sh.name,
          enable: true,
          controlsToDisable: sh['controls-to-disable'],
        })),
      };
    };
    const setSSMAutomationConfig = async () => {
      if (globalOptions['ssm-automation'].length === 0) return;
      const ssmAutomation = globalOptions['ssm-automation'];
      const aseaSsmEnableRegions = ssmAutomation.flatMap((ssm) => ssm.regions);
      const excludeRegions = globalOptions['supported-regions'].filter((r) => !aseaSsmEnableRegions.includes(r));
      const documents = ssmAutomation
        .flatMap((ssm) => ssm.documents)
        .filter((doc, indx, filtered) => filtered.findIndex((d) => d.name === doc.name) === indx);
      type DocumentSet = {
        shareTargets: { organizationalUnits?: string[]; accounts?: string[] };
        documents: { name: string; template: string }[];
      };
      const documentSets: DocumentSet[] = [];
      for (const document of documents) {
        const documentContent = await this.s3.getObjectBodyAsString({
          Bucket: this.centralBucketName,
          Key: path.join(SSM_DOCUMENTS_CONFIG_PATH, document.template),
        });
        await writeConfig(path.join(this.outputFolder, SSM_DOCUMENTS_CONFIG_PATH, document.template), documentContent);
        const documentSet: DocumentSet = {
          // Adding one document into documentSet to make shareTargets computation easy
          // TODO: Consolidate
          documents: [
            {
              name: document.name,
              template: path.join(SSM_DOCUMENTS_CONFIG_PATH, document.template),
            },
          ],
          shareTargets: ssmDocumentSharedTo(document.name),
        };
        documentSets.push(documentSet);
      }
      securityConfigAttributes.centralSecurityServices.ssmAutomation = {
        excludeRegions,
        documentSets,
      };
    };
    const setCloudWatchConfig = async () => {
      if (!globalOptions.cloudwatch) return;
      const consolidatedMetrics = _.groupBy(globalOptions.cloudwatch.metrics, function (item) {
        return [...item.accounts, ...item.regions];
      });
      Object.entries(consolidatedMetrics).forEach(([_groupKey, values]) => {
        securityConfigAttributes.cloudWatch.metricSets.push({
          regions: values[0].regions,
          deploymentTargets: { accounts: values[0].accounts.map((a) => this.getAccountKeyforLza(globalOptions, a)) },
          metrics: values.map((v) => ({
            filterName: v['filter-name'],
            logGroupName: v['loggroup-name'],
            filterPattern: v['filter-pattern'],
            metricNamespace: v['metric-namespace'],
            metricName: v['metric-name'],
            metricValue: v['metric-value'],
          })),
        });
      });
      const alarmsConfig = globalOptions.cloudwatch.alarms;
      const alarms = alarmsConfig.definitions.map((d) => ({
        'accounts': d.accounts || alarmsConfig['default-accounts'],
        'regions': d.regions || alarmsConfig['default-regions'],
        'namespace': d.namespace || alarmsConfig['default-namespace'],
        'statistic': d.statistic || alarmsConfig['default-statistic'],
        'period': d.period || alarmsConfig['default-period'],
        'threshold-type': d['threshold-type'] || alarmsConfig['default-threshold-type'],
        'comparison-operator': d['comparison-operator'] || alarmsConfig['default-comparison-operator'],
        'threshold': d.threshold || alarmsConfig['default-threshold'],
        'evaluation-periods': d['evaluation-periods'] || alarmsConfig['default-evaluation-periods'],
        'treat-missing-data': d['treat-missing-data'] || alarmsConfig['default-treat-missing-data'],
        'alarm-name': d['alarm-name'],
        'metric-name': d['metric-name'],
        'sns-alert-level': d['sns-alert-level'],
        'alarm-description': d['alarm-description'],
        'in-org-mgmt-use-lcl-sns':
          d['in-org-mgmt-use-lcl-sns'] !== undefined
            ? d['in-org-mgmt-use-lcl-sns']
            : alarmsConfig['default-in-org-mgmt-use-lcl-sns'],
      }));
      const consolidatedAlarms = _.groupBy(alarms, function (item) {
        return [...item.accounts, ...item.regions];
      });
      Object.entries(consolidatedAlarms).forEach(([_groupKey, values]) => {
        securityConfigAttributes.cloudWatch.alarmSets.push({
          regions: values[0].regions,
          deploymentTargets: { accounts: values[0].accounts.map((a) => this.getAccountKeyforLza(globalOptions, a)) },
          alarms: values.map((v) => ({
            alarmName: v['alarm-name'],
            alarmDescription: v['alarm-description'],
            snsTopicName: `${this.aseaPrefix}Notification-${v['sns-alert-level']}`,
            metricName: v['metric-name'],
            namespace: v.namespace,
            comparisonOperator: v['comparison-operator'],
            evaluationPeriods: v['evaluation-periods'],
            period: v.period,
            statistic: v.statistic,
            threshold: v.threshold,
            treatMissingData: v['treat-missing-data'],
          })),
        });
      });
    };
    const setDefaultEBSVolumeEncryptionConfig = async () => {
      const existingEbsKeys = findValuesFromOutputs({
        outputs: this.outputs,
        predicate: (o) => o.type === 'EbsKms',
      });
      securityConfigAttributes.keyManagementService = {
        keySets: [
          {
            name: `${this.aseaPrefix}EBS-Key`, // Custom alias. Name in each account is unique appended by random string
            alias: `${this.aseaPrefix}EBS-Key`, // Custom alias. Name in each account is unique appended by random string
            // policy: 'kms/ebs-encryption-key.json', // TODO: Prepare encryption key policy. Each region will have it's own policy with ec2 service endpoint
            description: 'Key used to encrypt/decrypt EBS by default',
            enableKeyRotation: true,
            enabled: true,
            deploymentTargets: {
              accounts: existingEbsKeys.map((o) => this.getAccountKeyforLza(globalOptions, o.accountKey)), // Confirm about regions. ASEA will only deploy in VPC region
            },
          },
        ],
      };
      securityConfigAttributes.centralSecurityServices.ebsDefaultVolumeEncryption = {
        enable: true,
        kmsKey: `${this.aseaPrefix}EBS-Key`,
      };
    };
    const setConfigAggregatorConfig = async () => {
      if (
        centralSecurityConfig['config-aggr'] ||
        globalOptions['aws-org-management']['config-aggr'] ||
        globalOptions['central-operations-services']['config-aggr'] ||
        globalOptions['central-log-services']['config-aggr']
      ) {
        securityConfigAttributes.awsConfig.aggregation = {
          enable: true,
          delegatedAdminAccount:
            (centralSecurityConfig['config-aggr'] &&
              this.getAccountKeyforLza(globalOptions, centralSecurityConfig.account)) ??
            (globalOptions['aws-org-management']['config-aggr'] &&
              this.getAccountKeyforLza(globalOptions, globalOptions['aws-org-management'].account)) ??
            (globalOptions['central-operations-services']['config-aggr'] &&
              this.getAccountKeyforLza(globalOptions, globalOptions['aws-org-management'].account)) ??
            ((globalOptions['central-log-services']['config-aggr'] &&
              this.getAccountKeyforLza(globalOptions, globalOptions['aws-org-management'].account)) ||
              this.getAccountKeyforLza(globalOptions, centralSecurityConfig.account)),
        };
      }
    };
    const setConfigRulesConfig = async () => {
      if (!globalOptions['aws-config']) return;
      // TODO: Consider account regions for deploymentTargets
      const rulesWithTarget: (AwsConfigRule & {
        deployTo?: string[];
        excludedAccounts?: string[];
        excludedRegions?: string[];
      })[] = [];
      for (const configRule of globalOptions['aws-config'].rules) {
        const deployToOus: string[] = [];
        const excludedAccounts: string[] = [];
        const excludedRegions = new Set<string>();
        organizationalUnits.forEach(([ouKey, ouConfig]) => {
          const matchedConfig = ouConfig['aws-config'].find((c) => c.rules.includes(configRule.name));
          if (!matchedConfig) return;
          deployToOus.push(ouKey);
          matchedConfig['excl-regions'].forEach((r) => excludedRegions.add(r));
        });
        deployToOus.forEach((ouKey) => {
          for (const [accountKey, accountConfig] of aseaConfig.getAccountConfigsForOu(ouKey)) {
            if (!accountConfig['aws-config']) break;
            if (
              accountConfig['aws-config'].filter((c) => c['excl-rules'].find((r) => r.includes(configRule.name)))
                .length > 0
            ) {
              excludedAccounts.push(accountKey);
            }
          }
        });
        const rule: AwsConfigRule & { deployTo?: string[]; excludedAccounts?: string[]; excludedRegions?: string[] } = {
          name: configRule.name,
          description: undefined,
          identifier: undefined,
          type: configRule.type,
          inputParameters: this.replaceAccelLookupValues(configRule.parameters),
          tags: undefined,
          complianceResourceTypes: configRule['resource-types'].length > 0 ? configRule['resource-types'] : undefined,
          remediation: configRule.remediation
            ? {
              targetId: configRule['remediation-action']!,
              parameters: this.replaceAccelLookupValuesForRedemption(configRule['remediation-params']),
              maximumAutomaticAttempts: configRule['remediation-attempts'],
              retryAttemptSeconds: configRule['remediation-retry-seconds'],
              automatic: true,
              rolePolicyFile: '/** TODO: Create Policy **/',
              targetAccountName: undefined,
              targetDocumentLambda: undefined,
              targetVersion: undefined,
            }
            : undefined,
          customRule: undefined,
          deployTo: deployToOus,
          excludedAccounts,
          excludedRegions: Array.from(excludedRegions),
        };
        rulesWithTarget.push(rule);
      }
      const consolidatedRules = _.groupBy(rulesWithTarget, function (item) {
        return `${item.deployTo?.join(',')}$${item.excludedAccounts?.join(',')}$${item.excludedRegions?.join(',')}`;
      });
      Object.entries(consolidatedRules).forEach(([_groupKey, values]) => {
        const deploymentTargets = {
          organizationalUnits: values[0].deployTo,
          excludedRegions: values[0].excludedRegions,
          excludedAccounts: values[0].excludedAccounts,
        };
        securityConfigAttributes.awsConfig.ruleSets.push({
          deploymentTargets,
          rules: values.map((cr) => ({
            name: cr.name,
            type: cr.type,
            inputParameters: cr.inputParameters,
            complianceResourceTypes: cr.complianceResourceTypes,
            remediation: cr.remediation,
          })),
        });
      });
    };

    await setMacieConfig();
    await setGuarddutyConfig();
    await setSecurityhubConfig();
    await setSSMAutomationConfig();
    await setDefaultEBSVolumeEncryptionConfig();
    await setCloudWatchConfig();
    await setConfigAggregatorConfig();
    await setConfigRulesConfig();
    const securityConfig = SecurityConfig.fromObject(securityConfigAttributes);
    const yamlConfig = yaml.dump(securityConfig);
    await writeConfig(path.join(this.outputFolder, SecurityConfig.FILENAME), yamlConfig);
  }

  async prepareNetworkConfig(aseaConfig: AcceleratorConfig) {
    const accountsConfig = aseaConfig.getAccountConfigs();
    const globalOptions = aseaConfig['global-options'];
    const organizationalUnitsConfig = aseaConfig.getOrganizationConfigs();
    const networkConfigAttributes: { [key: string]: any } = {
      defaultVpc: {
        delete: true,
        excludeAccounts: [],
      },
      endpointPolicies: [],
      vpcs: [],
    };
    const setCertificatesConfig = async () => {
      type CertificateType = {
        name: string;
        type: 'request' | 'import';
        privKey?: string;
        cert?: string;
        chain?: string;
        validation?: 'DNS' | 'EMAIL';
        domain?: string;
        san?: string[];
        deploymentTargets?: {
          accounts: string[];
          organizationalUnits: string[];
        };
      };
      const certificates: CertificateType[] = [];
      const processedCertificates = new Set<string>();
      const getTransformedCertificate = (certificate: CertificateConfig) => {
        const certificateConfig: CertificateType = {
          name: certificate.name,
          type: certificate.type,
          deploymentTargets: {
            accounts: accountsConfig
              .filter(
                ([_accountKey, accountConfig]) =>
                  !!accountConfig.certificates?.find((c) => c.name === certificate.name),
              )
              .map(([accountKey]) => this.getAccountKeyforLza(globalOptions, accountKey)),
            organizationalUnits: organizationalUnitsConfig
              .filter(([_ouKey, ouConfig]) => !!ouConfig.certificates?.find((c) => c.name === certificate.name))
              .map(([ouKey]) => ouKey),
          },
        };
        if (ImportCertificateConfigType.is(certificate)) {
          certificateConfig.privKey = certificate['priv-key'];
          certificateConfig.cert = certificate.cert;
          certificateConfig.chain = certificate.chain;
        } else {
          certificateConfig.domain = certificate.domain;
          certificateConfig.validation = certificate.validation;
          certificateConfig.san = certificate.san;
        }
        return certificateConfig;
      };
      for (const [_accountKey, accountConfig] of accountsConfig) {
        if (!accountConfig.certificates) continue;
        accountConfig.certificates.forEach((certificate) => {
          if (processedCertificates.has(certificate.name)) return;
          certificates.push(getTransformedCertificate(certificate));
          processedCertificates.add(certificate.name);
        });
      }
      for (const [_ouKey, ouConfig] of organizationalUnitsConfig) {
        if (!ouConfig.certificates) continue;
        ouConfig.certificates.forEach((certificate) => {
          if (processedCertificates.has(certificate.name)) return;
          certificates.push(getTransformedCertificate(certificate));
          processedCertificates.add(certificate.name);
        });
      }
      networkConfigAttributes.certificates = certificates;
    };
    const setTransitGatewaysConfig = async () => {
      const tgwAccountConfigs = accountsConfig.filter(([_accountKey, accountConfig]) => (accountConfig.deployments?.tgw?.length || 0) > 0);
      if (tgwAccountConfigs.length === 0) return;
      const transitGateways: any[] = [];
      for (const [accountKey, accountConfig] of tgwAccountConfigs) {
        const tgwConfigs = accountConfig.deployments?.tgw!;
        tgwConfigs.map(tgwConfig => {
          transitGateways.push({
            name: tgwConfig.name,
            account: this.getAccountKeyforLza(globalOptions, accountKey),
            region: tgwConfig.region,
            asn: tgwConfig.asn,
            dnsSupport: tgwConfig.features?.['DNS-support']? 'enable': 'disable',
            vpnEcmpSupport: tgwConfig.features?.['VPN-ECMP-support']? 'enable': 'disable',
            defaultRouteTableAssociation: tgwConfig.features?.['Default-route-table-association']? 'enable': 'disable',
            defaultRouteTablePropagation: tgwConfig.features?.['Default-route-table-propagation']? 'enable': 'disable',
            autoAcceptSharingAttachments: tgwConfig.features?.['DNS-support']? 'enable': 'disable',
            routeTables: tgwConfig['tgw-routes']?.map(tr => ({
              name: tr.name,
              routes: tr.routes?.map(r => ({
                destinationCidrBlock: r.destination,
                blackhole: r['blackhole-route'],
                // attachment:
              })),
            })),
          });
        });
      }
      networkConfigAttributes.transitGateways = transitGateways;
    };
    const setVpcConfig = async () => {
      const vpcConfigs = aseaConfig.getVpcConfigs();
      if (vpcConfigs.length === 0) return;
      const defaultVpcFlowLogsConfig = globalOptions['vpc-flow-logs'];
      const prepareNatGatewayConfig = (vpcConfig: VpcConfig) => {
        if (!vpcConfig.natgw) return;
        const natGatewaySubnets = this.getAzSubnets(vpcConfig, vpcConfig.natgw.subnet.name, vpcConfig.natgw.subnet.az);
        return natGatewaySubnets.map((s) => ({
          name: createNatGatewayName(s.subnetName, s.az),
          subnet: createSubnetName(vpcConfig.name, s.subnetName, s.az),
        }));
      };
      const prepareSecurityGroupRules = (rules: SecurityGroupRuleConfig[], accountKey: string) => {
        const lzaRules: SecurityGroupRuleType[] = [];
        for (const rule of rules) {
          const lzaRule: SecurityGroupRuleType = {
            description: rule.description,
            types: rule.type,
            tcpPorts: rule['tcp-ports'],
            udpPorts: rule['udp-ports'],
            fromPort: rule.fromPort,
            toPort: rule.toPort,
            sources: [],
          };
          for (const source of rule.source) {
            if (SecurityGroupSourceConfig.is(source)) {
              lzaRule.sources.push({
                securityGroups: source['security-group'],
              });
            } else if (SubnetSourceConfig.is(source)) {
              lzaRule.sources.push({
                account: this.getAccountKeyforLza(globalOptions, source.account || accountKey),
                subnets: source.subnet.flatMap((sourceSubnet) =>
                  aseaConfig
                    .getAzSubnets(source.account || accountKey, source.vpc, sourceSubnet)
                    .map((s) => createSubnetName(source.vpc, s.subnetName, s.az)),
                ),
                vpc: source.vpc,
              });
            } else {
              lzaRule.sources.push(source);
            }
          }
          lzaRules.push(lzaRule);
        }
        return lzaRules;
      };

      const prepareSecurityGroupsConfig = (vpcConfig: VpcConfig, accountKey: string) => {
        const securityGroups = vpcConfig['security-groups'];
        if (!securityGroups) return [];
        return securityGroups.map((sg) => ({
          name: sg.name,
          inboundRules: prepareSecurityGroupRules(sg['inbound-rules'], accountKey),
          outboundRules: prepareSecurityGroupRules(sg['outbound-rules'], accountKey),
          // description: '', // Prepare description if needed
        }));
      };
      const prepareNaclRules = (rules: NaclConfig[], accountKey: string) => {
        const lzaRules: (LzaNaclInboundRuleType | LzaNaclOutboundRuleType)[] = [];
        for (const rule of rules) {
          for (const dest of rule['cidr-blocks']) {
            let ruleNumber = rule.rule;
            if (typeof dest === 'string') {
              lzaRules.push({
                rule: ruleNumber,
                protocol: rule.protocol,
                fromPort: rule.ports,
                toPort: rule.ports,
                action: rule['rule-action'] as 'allow' | 'deny',
                source: !rule.egress ? dest : undefined,
                destination: rule.egress ? dest : undefined,
              });
              ruleNumber += 200;
            } else {
              const destinationVpcConfig = vpcConfigs.find(
                (v) => v.accountKey === dest.account && v.vpcConfig.name === dest.vpc,
              );
              const ruleSubnets = destinationVpcConfig?.vpcConfig.subnets
                ?.filter((s) => dest.subnet.includes(s.name))
                .flatMap((s) => this.getAzSubnets(destinationVpcConfig?.vpcConfig!, s.name));
              for (const ruleSubnet of ruleSubnets || []) {
                const target = {
                  account: this.getAccountKeyforLza(globalOptions, dest.account || accountKey),
                  subnet: createSubnetName(dest.vpc, ruleSubnet.subnetName, ruleSubnet.az),
                  vpc: dest.vpc,
                };
                lzaRules.push({
                  rule: ruleNumber,
                  protocol: rule.protocol,
                  fromPort: rule.ports,
                  toPort: rule.ports,
                  action: rule['rule-action'] as 'allow' | 'deny',
                  source: !rule.egress ? target : undefined,
                  destination: rule.egress ? target : undefined,
                });
                ruleNumber += 200;
              }
            }
          }
        }
        return lzaRules;
      };
      const prepareNaclConfig = (vpcConfig: VpcConfig, accountKey: string) => {
        const naclSubnetConfigs = vpcConfig.subnets?.filter((s) => !!s.nacls);
        if (!naclSubnetConfigs) return;
        const nacls = [];
        for (const subnetConfig of naclSubnetConfigs) {
          const naclConfig = subnetConfig.nacls!;
          const inboundRules = naclConfig.filter((r) => !r.egress);
          const outboundRules = naclConfig.filter((r) => r.egress);

          nacls.push({
            name: createNaclName(vpcConfig.name, subnetConfig.name),
            subnetAssociations: this.getAzSubnets(vpcConfig, subnetConfig.name).map((s) =>
              createSubnetName(vpcConfig.name, s.subnetName, s.az),
            ),
            inboundRules: prepareNaclRules(inboundRules, accountKey),
            outboundRules: prepareNaclRules(outboundRules, accountKey),
          });
        }
        return nacls;
      };
      const prepareVpcFlowLogs = (destinationType: 'S3' | 'CWL' | 'BOTH' | 'NONE') => {
        const destinationTypes = {
          S3: ['s3'],
          CWL: ['cloud-watch-logs'],
          BOTH: ['s3', 'cloud-watch-logs'],
        };
        if (destinationType === 'NONE') return;
        return {
          trafficType: defaultVpcFlowLogsConfig.filter,
          maxAggregationInterval: defaultVpcFlowLogsConfig.interval,
          destinations: destinationTypes[destinationType],
          defaultFormat: defaultVpcFlowLogsConfig['default-format'],
          customFields: defaultVpcFlowLogsConfig['custom-fields'],
        };
      };
      const prepareSubnetConfig = (vpcConfig: VpcConfig, ouKey: string, accountKey: string) => {
        if (!vpcConfig.subnets) return;
        const lzaSubnets: SubnetType[] = [];
        for (const subnetConfig of vpcConfig.subnets) {
          lzaSubnets.push(
            ...subnetConfig.definitions
              .filter((s) => !s.disabled)
              .map((d) => {
                let ipv4CidrBlock: string;
                if (vpcConfig['cidr-src'] === 'provided' || d.cidr?.value) {
                  ipv4CidrBlock = d.cidr?.value?.toCidrString()!;
                } else {
                  ipv4CidrBlock = this.subnetAssignedCidrs.find(
                    (sc) =>
                      sc['account-key'] === accountKey &&
                      sc.region === vpcConfig.region &&
                      sc['vpc-name'] === vpcConfig.name &&
                      sc['subnet-name'] === subnetConfig.name &&
                      sc.az === d.az &&
                      sc['subnet-pool'] === d.cidr?.pool,
                  )?.cidr!;
                }
                return {
                  name: createSubnetName(vpcConfig.name, subnetConfig.name, d.az),
                  availabilityZone: `${vpcConfig.region}${d.az}`,
                  ipv4CidrBlock,
                  routeTable: d['route-table'],
                  shareTargets:
                    subnetConfig['share-to-ou-accounts'] || subnetConfig['share-to-specific-accounts']
                      ? {
                        organizationalUnits: subnetConfig['share-to-ou-accounts'] ? [ouKey] : undefined,
                        accounts: subnetConfig['share-to-specific-accounts']?.map((lAccountKey) =>
                          this.getAccountKeyforLza(globalOptions, lAccountKey),
                        ),
                      }
                      : undefined,
                };
              }),
          );
        }
        return lzaSubnets;
      };
      const prepareTgwAttachConfig = (vpcConfig: VpcConfig) => {
        const tgwAttach = vpcConfig['tgw-attach'];
        if (!tgwAttach) return;
        return [{
          name: createTgwAttachName(vpcConfig.name, tgwAttach['associate-to-tgw']),
          transitGateway: {
            name: tgwAttach['associate-to-tgw'],
            account: tgwAttach.account,
          },
          subnets: tgwAttach['attach-subnets']
            ?.flatMap((s) => this.getAzSubnets(vpcConfig, s))
            .map((s) => createSubnetName(vpcConfig.name, s.subnetName, s.az)),
          routeTableAssociations: tgwAttach['tgw-rt-associate'],
          routeTablePropagations: tgwAttach['tgw-rt-propagate'],
        }];
      };
      // const prepareRouteTableConfig = (vpcConfig: VpcConfig) => {
      //   const routeTables = vpcConfig['route-tables'];
      //   if (!routeTables) return;
      //   return routeTables.map(rt => ({
      //     name: rt.name,
      //     routes: rt.routes?.map(r => ({
      //       name: r.name,
      //       destination: r.destination,
      //       target: r.target,
      //     })),
      //   }));
      // };
      const lzaVpcConfigs = [];
      for (const { accountKey, vpcConfig, ouKey } of vpcConfigs) {
        if (vpcConfig.deploy !== 'local' && vpcConfig.deploy !== accountKey) {
          console.error(
            `Invalid VPC configuration found VPC: "${vpcConfig.name}" in Account: "${accountKey}" and OU: "${ouKey}"`,
          );
          continue;
        }
        const cidrs: string[] = [];
        if (vpcConfig['cidr-src'] === 'provided') {
          cidrs.push(...vpcConfig.cidr.map((c) => c.value!.toCidrString()));
        } else {
          vpcConfig.cidr.map((c) => {
            if (c.value) {
              cidrs.push(c.value.toCidrString());
            } else {
              cidrs.push(
                this.vpcAssignedCidrs.find(
                  (vc) =>
                    vc['account-key'] === accountKey &&
                    vc.pool === c.pool &&
                    vc.region === vpcConfig.region &&
                    vc['vpc-name'] === vpcConfig.name &&
                    vc.status === 'assigned',
                )?.cidr!,
              );
            }
          });
        }
        const lzaAccountKey = this.getAccountKeyforLza(globalOptions, accountKey);
        lzaVpcConfigs.push({
          name: createVpcName(vpcConfig.name),
          account: lzaAccountKey,
          cidrs,
          region: vpcConfig.region,
          defaultSecurityGroupRulesDeletion: true,
          enableDnsHostnames: true,
          enableDnsSupport: true,
          gatewayEndpoints: vpcConfig['gateway-endpoints']
            ? {
              defaultPolicy: 'Default',
              endpoints: vpcConfig['gateway-endpoints'].map((service) => ({ service })),
            }
            : undefined,
          instanceTenancy: vpcConfig['dedicated-tenancy'] ? 'dedicated' : 'default',
          interfaceEndpoints: vpcConfig['interface-endpoints']
            ? {
              defaultPolicy: 'Default',
              endpoints: vpcConfig['interface-endpoints'].endpoints.map((service) => ({ service })),
              subnets: vpcConfig.subnets
                ?.find((s) => s.name === vpcConfig['interface-endpoints']?.subnet)
                ?.definitions.filter((s) => !s.disabled)
                .map((s) => createSubnetName(vpcConfig.name, vpcConfig['interface-endpoints']?.subnet!, s.az)),
              central: vpcConfig['central-endpoint'],
              allowedCidrs: vpcConfig['interface-endpoints']['allowed-cidrs'],
            }
            : undefined,
          internetGateway: vpcConfig.igw,
          useCentralEndpoints: vpcConfig['use-central-endpoints'],
          natGateways: prepareNatGatewayConfig(vpcConfig),
          securityGroups: prepareSecurityGroupsConfig(vpcConfig, accountKey),
          networkAcls: prepareNaclConfig(vpcConfig, lzaAccountKey),
          vpcFlowLogs: prepareVpcFlowLogs(vpcConfig['flow-logs']),
          subnets: prepareSubnetConfig(vpcConfig, ouKey, accountKey),
          transitGatewayAttachments: prepareTgwAttachConfig(vpcConfig),
          virtualPrivateGateway: vpcConfig.vgw?.asn,
          // TODO: Comeback after customizationConfig
          // loadBalancers:
          // targetGroups:
        });
      }
      networkConfigAttributes.vpcs = lzaVpcConfigs;
    };
    await setCertificatesConfig();
    await setVpcConfig();
    await setTransitGatewaysConfig();
    const networkConfig = NetworkConfig.loadFromString(JSON.stringify(networkConfigAttributes));
    const yamlConfig = yaml.dump(networkConfig);
    await writeConfig(path.join(this.outputFolder, NetworkConfig.FILENAME), yamlConfig);
  }

  private replaceAccelLookupValuesForRedemption(params: { [key: string]: string | string[] }) {
    const parameters: {
      name: string;
      value: string;
      type: string;
    }[] = [];
    if (Object.entries(params).length === 0) return undefined;
    Object.entries(params).forEach(([key, value]) => {
      let parsedValue = '';
      if (typeof value === 'object') {
        parsedValue = JSON.parse(this.applyReplacements(JSON.stringify(value))).join(',');
      } else {
        parsedValue = this.applyReplacements(value);
      }
      parameters.push({
        name: key,
        value: parsedValue,
        type: typeof value === 'object' ? 'StringList' : 'String',
      });
    });
    return parameters;
  }

  private replaceAccelLookupValues(params: { [key: string]: string }) {
    if (Object.entries(params).length === 0) return undefined;
    Object.entries(params).forEach(([key, value]) => {
      params[key] = this.applyReplacements(value);
    });
    return params;
  }

  private applyReplacements(value: string) {
    value = value.replace('${SEA::LogArchiveAesBucket}', '${ACCEL_LOOKUP::Bucket:elbLogs}');
    value = value.replace('${SEA::S3BucketEncryptionKey}', '${ACCEL_LOOKUP::KMS}');
    return value;
  }

  private getAzSubnets(vpcConfig: VpcConfig, subnetName: string, az?: string) {
    return (
      vpcConfig.subnets
        ?.find((s) => s.name === subnetName)
        ?.definitions.filter((s) => !s.disabled && (!az || s.az === az))
        .map((d) => ({
          subnetName,
          ...d,
        })) || []
    );
  }
}
