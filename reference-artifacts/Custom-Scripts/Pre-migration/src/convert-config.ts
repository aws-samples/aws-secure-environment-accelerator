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
  PcxRouteConfig,
  ResolvedVpcConfig,
  RouteTableConfig,
  SecurityGroupRuleConfig,
  SecurityGroupSourceConfig,
  SubnetConfig,
  SubnetDefinitionConfig,
  SubnetSourceConfig,
  TgwDeploymentConfig,
  TransitGatewayRouteConfig,
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
import { loadAccounts } from './common/utils/accounts';
import {
  createNaclName,
  createNatGatewayName,
  createNetworkFirewallName,
  createNetworkFirewallPolicyName,
  createNetworkFirewallRuleGroupName,
  createRouteTableName,
  createSubnetName,
  createTgwAttachName,
  createVpcName,
  nfwRouteName,
  peeringConnectionName,
  securityGroupName,
  subnetsCidrsTableName,
  transitGatewayName,
  transitGatewayPeerName,
  transitGatewayRouteTableName,
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
import {
  NetworkConfig,
  NfwFirewallConfig,
  NfwFirewallPolicyConfig,
  NfwLoggingConfig,
  NfwRuleGroupConfig,
  NfwRuleSourceCustomActionConfig,
  NfwRuleSourceStatelessRuleConfig,
} from './config/network-config';
import { OrganizationConfig, OrganizationConfigType } from './config/organization-config';
import { AwsConfigRule, SecurityConfig } from './config/security-config';
import { StackOutput, findValuesFromOutputs, loadOutputs } from './common/outputs/load-outputs';
import { SSM } from './common/aws/ssm';
import { STS } from './common/aws/sts';
import { Region } from './config/common-types';

const IAM_POLICY_CONFIG_PATH = 'iam-policy';
const SCP_CONFIG_PATH = 'scp';
const SSM_DOCUMENTS_CONFIG_PATH = 'ssm-documents';
const MAD_CONFIG_SCRIPTS = 'config/scripts';
const CONFIG_RULES_PATH = 'config-rules';
const LZA_SCP_CONFIG_PATH = 'service-control-policies';
const LZA_MAD_CONFIG_SCRIPTS = 'ad-config-scripts/';
const LZA_CONFIG_RULES = 'custom-config-rules';

const LOG_RETENTION = [
  1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653,
];
/**
 * Assets required for LZA configuration
 * - Config Rule remediation role policies
 */
const ConfigRuleRemediationAssets: { [key: string]: string } = {
  'Attach-IAM-Instance-Profile': path.join(LZA_CONFIG_RULES, 'attach-ec2-instance-profile-remediation-role.json'),
  'Attach-IAM-Role-Policy': path.join(LZA_CONFIG_RULES, 'ec2-instance-profile-permissions-remediation-role.json'),
  'SSM-ELB-Enable-Logging': path.join(LZA_CONFIG_RULES, 'elb-logging-enabled-remediation-role.json'),
  'Put-S3-Encryption': path.join(LZA_CONFIG_RULES, 'bucket-sse-enabled-remediation-role.json'),
};

const ConfigRuleDetectionAssets: { [key: string]: string } = {
  'EC2-INSTANCE-PROFILE': path.join(LZA_CONFIG_RULES, 'attach-ec2-instance-profile-detection-role.json'),
  'EC2-INSTANCE-PROFILE-PERMISSIONS': path.join(
    LZA_CONFIG_RULES,
    'ec2-instance-profile-permissions-detection-role.json',
  ),
};

type LzaNaclRuleType = {
  rule: number;
  protocol: number;
  fromPort: number;
  toPort: number;
  action: 'allow' | 'deny';
};
type LzaNaclInboundRuleType = LzaNaclRuleType & {
  source?: string | { account?: string; vpc: string; subnet: string; regoin?: string };
};

type LzaNaclOutboundRuleType = LzaNaclRuleType & {
  destination?: string | { account?: string; vpc: string; subnet: string; regoin?: string };
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

async function writeFile(filePath: string, data: any) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) fs.mkdirSync(dirname, { recursive: true });
  fs.writeFileSync(filePath, data);
}

export class ConvertAseaConfig {
  private readonly aseaConfigRepositoryName: string;
  private readonly region: string;
  private readonly aseaPrefix: string;
  private readonly centralBucketName: string;
  private readonly parametersTable: string;
  private readonly s3: S3;
  private readonly sts: STS;
  private readonly dynamoDb: DynamoDB;
  private accounts: Account[] = [];
  private outputs: StackOutput[] = [];
  private vpcAssignedCidrs: VpcAssignedCidr[] = [];
  private subnetAssignedCidrs: SubnetAssignedCidr[] = [];
  private readonly outputFolder: string;
  private readonly mappingFileBucketName: string;
  private readonly acceleratorName: string;
  private vpcConfigs: ResolvedVpcConfig[] = [];
  private globalOptions: GlobalOptionsConfig | undefined;
  private ssmClients: { [region: string]: SSM } = {};
  private lzaAccountKeys: string[] | undefined;
  constructor(config: Config) {
    this.aseaConfigRepositoryName = config.repositoryName;
    this.region = config.homeRegion;
    this.centralBucketName = config.centralBucket!;
    this.aseaPrefix = config.aseaPrefix!.endsWith('-') ? config.aseaPrefix! : `${config.aseaPrefix}-`;
    this.parametersTable = `${this.aseaPrefix}Parameters`;
    this.acceleratorName = config.acceleratorName!;
    this.mappingFileBucketName = config.mappingBucketName!;
    this.sts = new STS();
    this.s3 = new S3(undefined, this.region);
    this.dynamoDb = new DynamoDB(undefined, this.region);
    this.outputFolder = config.configOutputFolder ?? 'converted';
  }

  async putParameter(name: string, value: string, accountKey?: string, region?: string) {
    const parameterRegion = region ?? this.region;
    const parameterAccountId = getAccountId(
      this.accounts,
      accountKey ?? this.globalOptions?.['aws-org-management'].account!,
    )!;
    const ssmClientKey = `${accountKey}-${parameterRegion}`;
    if (!this.ssmClients[ssmClientKey]) {
      const credentials = await this.sts.getCredentialsForAccountAndRole(
        parameterAccountId,
        `${this.aseaPrefix}PipelineRole`,
      );
      this.ssmClients[ssmClientKey] = new SSM(credentials, parameterRegion);
    }
    await this.ssmClients[ssmClientKey].putParameter({
      Name: name,
      Value: value,
      Type: 'String',
      Overwrite: true,
    });
  }

  async process() {
    const aseaConfig = await loadAseaConfig({
      filePath: 'raw/config.json',
      repositoryName: this.aseaConfigRepositoryName,
      defaultRegion: this.region,
    });
    this.accounts = await loadAccounts(this.parametersTable, this.dynamoDb);
    this.vpcAssignedCidrs = await loadVpcAssignedCidrs(vpcCidrsTableName(this.aseaPrefix), this.dynamoDb);
    this.subnetAssignedCidrs = await loadSubnetAssignedCidrs(subnetsCidrsTableName(this.aseaPrefix), this.dynamoDb);
    this.outputs = await loadOutputs(`${this.aseaPrefix}Outputs`, this.dynamoDb);
    this.vpcConfigs = aseaConfig.getVpcConfigs();
    this.globalOptions = aseaConfig['global-options'];
    await this.copyAdditionalAssets();
    await this.prepareGlobalConfig(aseaConfig);
    await this.prepareIamConfig(aseaConfig);
    this.lzaAccountKeys = await this.prepareAccountConfig(aseaConfig);
    await this.prepareOrganizationConfig(aseaConfig);
    await this.prepareSecurityConfig(aseaConfig);
    await this.prepareNetworkConfig(aseaConfig);
  }

  /**
   * Copy additional assets which are required for LZA
   */
  private async copyAdditionalAssets() {
    const dirname = path.join(this.outputFolder, LZA_CONFIG_RULES);
    if (!fs.existsSync(dirname)) fs.mkdirSync(dirname, { recursive: true });
    for (const fileName of Object.values(ConfigRuleRemediationAssets)) {
      fs.copyFileSync(path.join(__dirname, 'assets', fileName), path.join(this.outputFolder, fileName));
    }
    for (const fileName of Object.values(ConfigRuleDetectionAssets)) {
      fs.copyFileSync(path.join(__dirname, 'assets', fileName), path.join(this.outputFolder, fileName));
    }
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

  private getCentralNetworkAccount() {
    const centralResolvedVpcConfig = this.vpcConfigs.find(({ vpcConfig }) => vpcConfig['central-endpoint']);
    return centralResolvedVpcConfig?.accountKey;
  }

  /**
   * Transform rule variables to conform with LZA types.
   * @param ruleGroup
   * @returns
   */
  private transformRuleVariables(ruleGroup: any) {
    const ruleVariables = ruleGroup.ruleVariables;
    if (!ruleVariables) return;
    const ipSets: { name: string; definition: string[] }[] = [];
    const portSets: { name: string; definition: string[] }[] = [];
    for (const [name, definition] of Object.entries(ruleVariables.ipSets ?? {})) {
      ipSets.push({
        name,
        definition: (definition as { definition: string[] }).definition,
      });
    }
    for (const [name, definition] of Object.entries(ruleVariables.portSets ?? {})) {
      portSets.push({
        name,
        definition: (definition as { definition: string[] }).definition,
      });
    }
    return {
      ipSets,
      portSets,
    };
  }

  /**
   * Transform ruleOptions to conform with LZA types.
   * @param ruleGroup
   * @returns
   */
  private transformRuleOptions(ruleGroup: any) {
    if (!ruleGroup.statefulRuleOptions) return;
    return ruleGroup.statefulRuleOptions.ruleOrder;
  }

  /**
   * Transform stateless and custom rule group policies to conform with LZA types.
   * @param ruleGroup
   */
  private transformStatelessCustom(ruleSource: any) {
    const property = ruleSource.statelessRulesAndCustomActions;
    if (!property) return;
    const statelessRules: NfwRuleSourceStatelessRuleConfig[] = [];
    const customActions: NfwRuleSourceCustomActionConfig[] = [];
    for (const rule of property.statelessRules ?? []) {
      statelessRules.push({
        priority: rule.priority,
        ruleDefinition: {
          actions: rule.ruleDefinition.actions,
          matchAttributes: {
            destinationPorts: rule.ruleDefinition.matchAttributes?.destinationPorts ?? [],
            protocols: rule.ruleDefinition.matchAttributes?.protocols ?? [],
            sourcePorts: rule.ruleDefinition.matchAttributes?.sourcePorts ?? [],
            tcpFlags: rule.ruleDefinition.matchAttributes?.tcpFlags,
            destinations: (rule.ruleDefinition.matchAttributes.destinations ?? []).map(
              (destination: { addressDefinition: string }) => destination.addressDefinition,
            ),
            sources: (rule.ruleDefinition.matchAttributes.sources ?? []).map(
              (source: { addressDefinition: string }) => source.addressDefinition,
            ),
          },
        },
      });
    }
    return {
      statelessRules,
      customActions,
    };
  }

  /**
   * NetworkFirewallConfig is prepared considering ASEA firewall names are unique across all accounts and regions.
   * Default ASEA reference artifacts had only one firewall created.
   * Works for multiple nfw with different names
   *
   * TODO: Add suffix to make NFW name unique
   * @returns
   */
  private async getNetworkFirewallConfig() {
    const firewalls: NfwFirewallConfig[] = [];
    const policies: NfwFirewallPolicyConfig[] = [];
    const ruleGroups: NfwRuleGroupConfig[] = [];
    const nfwVpcConfigs = this.vpcConfigs.filter((resolvedVpcConfig) => !!resolvedVpcConfig.vpcConfig.nfw);
    for (const { vpcConfig, accountKey } of nfwVpcConfigs) {
      const networkFirewallConfig = vpcConfig.nfw!;
      const firewallConfigName = networkFirewallConfig['firewall-name'] || `${vpcConfig.name}-nfw`;
      const policyName = createNetworkFirewallPolicyName(
        networkFirewallConfig.policy?.name ?? 'Sample-Firewall-Policy',
        firewallConfigName,
        this.aseaPrefix,
      );
      const policyString =
        networkFirewallConfig.policyString ??
        (await this.s3.getObjectBodyAsString({
          Bucket: this.centralBucketName,
          Key: networkFirewallConfig.policy?.path ?? 'nfw/nfw-example-policy.json',
        }));
      const policyData = JSON.parse(policyString);
      policies.push({
        name: policyName,
        regions: [vpcConfig.region],
        description: undefined,
        shareTargets: {
          accounts: [this.getAccountKeyforLza(this.globalOptions!, accountKey!)],
          organizationalUnits: [],
        },
        tags: [],
        firewallPolicy: {
          statefulDefaultActions: policyData.statefulDefaultActions,
          statefulEngineOptions: policyData.statefulEngineOptions,
          statelessDefaultActions: policyData.statelessDefaultActions,
          statelessFragmentDefaultActions: policyData.statelessFragmentDefaultActions,
          statelessCustomActions: policyData.statelessCustomActions,
          statefulRuleGroups: policyData.statefulRuleGroup.map((ruleGroup: any) => ({
            name: createNetworkFirewallRuleGroupName(ruleGroup.ruleGroupName, firewallConfigName, this.aseaPrefix),
            priority: ruleGroup.priority,
          })),
          statelessRuleGroups: policyData.statelessRuleGroup.map((ruleGroup: any) => ({
            name: createNetworkFirewallRuleGroupName(ruleGroup.ruleGroupName, firewallConfigName, this.aseaPrefix),
            priority: ruleGroup.priority,
          })),
        },
      });
      [...policyData.statefulRuleGroup, ...policyData.statelessRuleGroup].forEach((ruleGroup: any) => {
        ruleGroups.push({
          capacity: ruleGroup.capacity,
          description: undefined,
          name: createNetworkFirewallRuleGroupName(ruleGroup.ruleGroupName, firewallConfigName, this.aseaPrefix),
          type: ruleGroup.type,
          regions: [vpcConfig.region],
          shareTargets: {
            accounts: [this.getAccountKeyforLza(this.globalOptions!, accountKey!)],
            organizationalUnits: [],
          },
          tags: [],
          ruleGroup: {
            rulesSource: {
              rulesSourceList: ruleGroup.ruleGroup.rulesSource.rulesSourceList,
              rulesFile: undefined,
              rulesString: ruleGroup.ruleGroup.rulesSource.rulesString,
              statefulRules: ruleGroup.ruleGroup.rulesSource.statefulRules,
              statelessRulesAndCustomActions: this.transformStatelessCustom(ruleGroup.ruleGroup.rulesSource),
            },
            ruleVariables: this.transformRuleVariables(ruleGroup.ruleGroup),
            statefulRuleOptions: this.transformRuleOptions(ruleGroup.ruleGroup),
          },
        });
      });
      const loggingConfiguration: NfwLoggingConfig[] = [];
      if (networkFirewallConfig['alert-dest'] !== 'None') {
        loggingConfiguration.push({
          destination: networkFirewallConfig['alert-dest'] === 'CloudWatch' ? 'cloud-watch-logs' : 's3',
          type: 'ALERT',
        });
      }
      if (networkFirewallConfig['flow-dest'] !== 'None') {
        loggingConfiguration.push({
          destination: networkFirewallConfig['flow-dest'] === 'CloudWatch' ? 'cloud-watch-logs' : 's3',
          type: 'FLOW',
        });
      }
      firewalls.push({
        deleteProtection: false,
        description: undefined,
        firewallPolicy: policyName,
        firewallPolicyChangeProtection: false,
        loggingConfiguration,
        name: createNetworkFirewallName(firewallConfigName, this.aseaPrefix),
        subnetChangeProtection: false,
        tags: [],
        vpc: createVpcName(vpcConfig.name),
        subnets: this.getAzSubnets(vpcConfig, networkFirewallConfig.subnet.name).map((subnet) =>
          createSubnetName(vpcConfig.name, subnet.subnetName, subnet.az),
        ),
      });
    }
    return {
      firewalls,
      policies,
      rules: ruleGroups,
    };
  }

  private async prepareGlobalConfig(aseaConfig: AcceleratorConfig) {
    const globalOptions = aseaConfig['global-options'];
    const centralizeLogging = globalOptions['central-log-services'];
    const costAndUsageReport = globalOptions.reports['cost-and-usage-report'];
    const dynamicLogPartitioning = centralizeLogging['dynamic-s3-log-partitioning'];
    if (dynamicLogPartitioning) {
      // Save dynamic-partitioning/log-filters.json
      await writeConfig(
        path.join(this.outputFolder, 'dynamic-partitioning', 'log-filters.json'),
        JSON.stringify(dynamicLogPartitioning),
      );
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
      cloudwatchLogRetentionInDays: LOG_RETENTION.includes(globalOptions['default-cwl-retention'])
        ? globalOptions['default-cwl-retention']
        : 3653,
      terminationProtection: true, // TODO: Confirm default
      controlTower: { enable: globalOptions['ct-baseline'] },
      cdkOptions: {
        centralizeBuckets: true,
        useManagementAccessRole: false,
        customDeploymentRole: `${this.aseaPrefix}LZA-DeploymentRole`,
        forceBootstrap: true,
      }, // TODO: Config default
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
          reportName: `${this.aseaPrefix}${costAndUsageReport['report-name']}`, // TODO: Remove aseaPrefix when we fix cost and usage report
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
    const yamlConfig = yaml.dump(globalConfig, { noRefs: true });
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
      if (accountConfig.deployments?.mad && accountConfig.deployments.mad.deploy) {
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
        const vpc = this.vpcConfigs
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
    const yamlConfig = yaml.dump(iamConfig, { noRefs: true });
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
    const accountKeys: string[] = [];
    Object.entries(aseaConfig['mandatory-account-configs']).forEach(([accountKey, accountConfig]) => {
      accountsConfig.mandatoryAccounts.push({
        name: this.getAccountKeyforLza(aseaConfig['global-options'], accountKey),
        description: accountConfig.description,
        email: accountConfig.email,
        organizationalUnit: accountConfig.ou,
        warm: false,
      });
      accountKeys.push(this.getAccountKeyforLza(aseaConfig['global-options'], accountKey));
    });
    Object.entries(aseaConfig['workload-account-configs']).forEach(([accountKey, accountConfig]) => {
      accountsConfig.workloadAccounts.push({
        name: accountKey,
        description: accountConfig.description,
        email: accountConfig.email,
        organizationalUnit: accountConfig.ou,
        warm: false,
      });
      accountKeys.push(accountKey);
    });

    const yamlConfig = yaml.dump(accountsConfig, { noRefs: true });
    await writeConfig(path.join(this.outputFolder, AccountsConfig.FILENAME), yamlConfig);
    return accountKeys;
  }

  /**
   * Converts ASEA organization units and scps into LZA organizational configuration
   * @param aseaConfig
   */
  private async prepareOrganizationConfig(aseaConfig: AcceleratorConfig) {
    const organizationConfig: OrganizationConfigType = {
      enable: true, // Always set as true, ASEA requirement is to have Organizations enabled
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
    // LZA Checks for workloads OU
    // if (!organizationConfig.organizationalUnits.find((ou) => ou.name === 'workloads')) {
    //   organizationConfig.organizationalUnits.push({ name: 'workloads', ignore: undefined });
    // }
    let quarantineScpPresent = false;
    const replacements = {
      '\\${GBL_REGION}': '${GLOBAL_REGION}',
      '\\${ORG_ADMIN_ROLE}': '${MANAGEMENT_ACCOUNT_ACCESS_ROLE}',
    };
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
      let policyData = await this.s3.getObjectBodyAsString({
        Bucket: this.centralBucketName,
        Key: path.join(SCP_CONFIG_PATH, scp.policy),
      });
      Object.entries(replacements).map(([key, value]) => {
        policyData = policyData.replace(new RegExp(key, 'g'), value);
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
      await writeConfig(
        path.join(this.outputFolder, LZA_SCP_CONFIG_PATH, `${quarantineScpName}.json`),
        quarantineScpContent,
      );
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

    const yamlConfig = yaml.dump(organizationConfig, { noRefs: true });
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
        maxPasswordAge: globalOptions['iam-password-policies']?.['max-password-age'] || 90,
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
          enable: false,
          excludeRegions: [],
          defaultReportsConfiguration: {
            enable: true,
            destinationType: 'S3',
          },
        },
        detective: {
          enable: false,
          excludeRegions: [],
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
        let content;
        let isYaml = false;
        if (document.template.endsWith('.json')) {
          content = JSON.parse(documentContent);
        } else {
          isYaml = true;
          content = yaml.load(documentContent);
        }
        content.description = document.description;
        await writeConfig(
          path.join(this.outputFolder, SSM_DOCUMENTS_CONFIG_PATH, document.template),
          isYaml ? yaml.dump(content, { noRefs: true }) : JSON.stringify(content),
        );
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
            filterPattern: v['filter-pattern'].trim(),
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
        const alarmAccountKeys = values[0].accounts.map((account) => {
          return this.getAccountKeyforLza(globalOptions, account);
        });

        const existingAlarmAccounts = alarmAccountKeys.filter((alarmAccount) => {
          return this.lzaAccountKeys?.includes(alarmAccount);
        });

        if (existingAlarmAccounts.length > 0) {
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
        }
      });
    };
    const setDefaultEBSVolumeEncryptionConfig = async () => {
      securityConfigAttributes.centralSecurityServices.ebsDefaultVolumeEncryption = {
        enable: true,
        excludeRegions: [],
      };
    };
    const setConfigAggregatorConfig = async () => {
      if (globalOptions['ct-baseline']) return;
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
        let excludeRemediateRegions: string[] = [];
        organizationalUnits.forEach(([ouKey, ouConfig]) => {
          const matchedConfig = ouConfig['aws-config'].find((c) => c.rules.includes(configRule.name));
          if (!matchedConfig) return;
          deployToOus.push(ouKey);
          excludeRemediateRegions = (this.globalOptions?.['supported-regions'] ?? []).filter(
            (region) => !matchedConfig['remediate-regions']?.includes(region),
          );
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
        const defaultSourcePath = `${configRule.name.toLowerCase()}.zip`;
        let customRuleProps;
        if (configRule.type === 'custom') {
          const aseaFilePath = path.join(CONFIG_RULES_PATH, configRule['runtime-path'] ?? defaultSourcePath);
          const lzaFilePath = path.join(
            this.outputFolder,
            LZA_CONFIG_RULES,
            configRule['runtime-path'] ?? defaultSourcePath,
          );
          const configSource = await this.s3.getObjectBody({
            Bucket: this.centralBucketName,
            Key: aseaFilePath,
          });
          await writeFile(lzaFilePath, configSource);
          customRuleProps = {
            lambda: {
              handler: 'index.handler',
              rolePolicyFile: ConfigRuleDetectionAssets[configRule.name] ?? '/** TODO: Create Policy **/',
              runtime: configRule.runtime!,
              sourceFilePath: path.join(LZA_CONFIG_RULES, configRule['runtime-path'] ?? defaultSourcePath),
              timeout: undefined,
            },
            maximumExecutionFrequency: configRule['max-frequency'] ?? 'TwentyFour_Hours',
            periodic: !!configRule['max-frequency'],
            configurationChanges: !!configRule['resource-types'].length,
            triggeringResources: {
              lookupKey: 'ResourceTypes',
              lookupType: 'ResourceTypes',
              lookupValue: configRule['resource-types'],
            },
          };
        }
        const rule: AwsConfigRule & { deployTo?: string[]; excludedAccounts?: string[]; excludedRegions?: string[] } = {
          name: configRule.name,
          description: undefined,
          identifier: undefined,
          type: configRule.type === 'custom' ? 'Custom' : undefined,
          inputParameters: this.replaceAccelLookupValues(configRule.parameters),
          tags: undefined,
          complianceResourceTypes: configRule.type === 'managed' ? configRule['resource-types'] : undefined,
          remediation: configRule.remediation
            ? {
                targetId: configRule['remediation-action']!,
                parameters: this.replaceAccelLookupValuesForRedemption(configRule['remediation-params']),
                maximumAutomaticAttempts: configRule['remediation-attempts'] ?? 5,
                retryAttemptSeconds: configRule['remediation-retry-seconds'] ?? 60,
                automatic: true,
                rolePolicyFile:
                  ConfigRuleRemediationAssets[configRule['remediation-action']!] ?? '/** TODO: Create Policy **/',
                targetAccountName: undefined,
                targetDocumentLambda: undefined,
                targetVersion: undefined,
                excludeRegions: excludeRemediateRegions as Region[],
              }
            : undefined,
          customRule: customRuleProps,
          deployTo: deployToOus,
          excludedAccounts,
          excludedRegions: excludeRemediateRegions,
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
          rules: values,
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
    const yamlConfig = yaml.dump(securityConfig, { noRefs: true });
    await writeConfig(path.join(this.outputFolder, SecurityConfig.FILENAME), yamlConfig);
  }

  async prepareNetworkConfig(aseaConfig: AcceleratorConfig) {
    const accountsConfig = aseaConfig.getAccountConfigs();
    const globalOptions = aseaConfig['global-options'];
    const organizationalUnitsConfig = aseaConfig.getOrganizationConfigs();
    // Creating default policy for vpc endpoints
    await writeConfig(
      path.join(this.outputFolder, 'vpc-endpoint-policies', 'default.json'),
      JSON.stringify({
        Statement: [
          {
            Effect: 'Allow',
            Principal: '*',
            Action: 'ec2:*',
            Resource: '*',
          },
        ],
      }),
    );
    const networkConfigAttributes: { [key: string]: any } = {
      defaultVpc: {
        delete: true,
        excludeAccounts: [],
      },
      endpointPolicies: [
        {
          name: 'Default',
          document: 'vpc-endpoint-policies/default.json',
        },
      ],
      vpcs: [],
      centralNetworkServices: {
        delegatedAdminAccount: this.getCentralNetworkAccount()!,
        networkFirewall: await this.getNetworkFirewallConfig(),
      },
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
          excludedRegions?: string[];
        };
        isExisting: true;
      };
      const certificates: CertificateType[] = [];
      const processedCertificates = new Set<string>();
      const getTransformedCertificate = async (certificate: CertificateConfig) => {
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
            excludedRegions: this.globalOptions?.['supported-regions'].filter((region) => region !== this.region) ?? [],
          },
          isExisting: true,
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
      for (const [accountKey, accountConfig] of accountsConfig) {
        if (!accountConfig.certificates) continue;
        for (const certificate of accountConfig.certificates) {
          const certificateOutput = findValuesFromOutputs({
            outputs: this.outputs,
            accountKey,
            region: this.region,
            predicate: (o) => o.type === 'Acm' && o.value.certificateName === certificate.name,
          })?.[0];
          await this.putParameter(`/acm/${certificate.name}/arn`, certificateOutput.value.certificateArn, accountKey);
          if (processedCertificates.has(certificate.name)) return;
          certificates.push(await getTransformedCertificate(certificate));
          processedCertificates.add(certificate.name);
        }
      }
      for (const [ouKey, ouConfig] of organizationalUnitsConfig) {
        if (!ouConfig.certificates) continue;
        const organizationAccounts = this.accounts.filter((account) => account.ou === ouKey);
        for (const certificate of ouConfig.certificates) {
          for (const { key: accountKey } of organizationAccounts ?? []) {
            const certificateOutput = findValuesFromOutputs({
              outputs: this.outputs,
              accountKey,
              region: this.region,
              predicate: (o) => o.type === 'Acm' && o.value.certificateName === certificate.name,
            })?.[0];
            await this.putParameter(`/acm/${certificate.name}/arn`, certificateOutput.value.certificateArn, accountKey);
          }
          if (processedCertificates.has(certificate.name)) return;
          certificates.push(await getTransformedCertificate(certificate));
          processedCertificates.add(certificate.name);
        }
      }
      networkConfigAttributes.certificates = certificates;
    };
    const setTransitGatewaysAndPeeringConfig = async () => {
      const getTransitGatewayRouteAttachment = (
        route: TransitGatewayRouteConfig,
        accountKey: string,
        tgwConfig: TgwDeploymentConfig,
      ) => {
        if (route['target-vpc']) {
          return {
            account: this.getAccountKeyforLza(globalOptions, route['target-account'] || accountKey),
            vpcName: createVpcName(route['target-vpc']),
          };
        } else if (route['target-vpn']) {
          return {
            vpnConnectionName: route['target-vpn'],
          };
        } else if (route['target-tgw']) {
          if (tgwConfig['tgw-attach'] && tgwConfig['tgw-attach']['associate-to-tgw'] === route['target-tgw']) {
            return {
              transitGatewayPeeringName: transitGatewayPeerName(tgwConfig.name, route['target-tgw']),
            };
          }
          return {
            transitGatewayPeeringName: transitGatewayPeerName(route['target-tgw'], tgwConfig.name),
          };
        } else {
          return;
        }
      };
      const prepareTransitGatewayRoutes = (
        routes: TransitGatewayRouteConfig[],
        accountKey: string,
        tgwConfig: TgwDeploymentConfig,
      ) => {
        const lzaRoutes: any[] = [];
        routes.forEach((route) => {
          lzaRoutes.push({
            destinationCidrBlock: route.destination,
            blackhole: route['blackhole-route'],
            attachment: getTransitGatewayRouteAttachment(route, accountKey, tgwConfig),
          });
        });
        return lzaRoutes;
      };
      const tgwAccountConfigs = accountsConfig.filter(
        ([_accountKey, accountConfig]) => (accountConfig.deployments?.tgw?.length || 0) > 0,
      );
      if (tgwAccountConfigs.length === 0) return;
      const transitGateways: any[] = [];
      const transitGatewayPeering: any[] = [];
      for (const [accountKey, accountConfig] of tgwAccountConfigs) {
        const lzaAccountKey = this.getAccountKeyforLza(globalOptions, accountKey);
        const tgwConfigs = accountConfig.deployments?.tgw!;
        tgwConfigs.forEach((tgwConfig) => {
          transitGateways.push({
            name: transitGatewayName(tgwConfig.name),
            account: lzaAccountKey,
            region: tgwConfig.region,
            asn: tgwConfig.asn,
            dnsSupport: tgwConfig.features?.['DNS-support'] ? 'enable' : 'disable',
            vpnEcmpSupport: tgwConfig.features?.['VPN-ECMP-support'] ? 'enable' : 'disable',
            defaultRouteTableAssociation: tgwConfig.features?.['Default-route-table-association']
              ? 'enable'
              : 'disable',
            defaultRouteTablePropagation: tgwConfig.features?.['Default-route-table-propagation']
              ? 'enable'
              : 'disable',
            autoAcceptSharingAttachments: tgwConfig.features?.['DNS-support'] ? 'enable' : 'disable',
            routeTables: tgwConfig['route-tables']?.map((routeTableName) => ({
              name: transitGatewayRouteTableName(routeTableName, tgwConfig.name),
              routes: prepareTransitGatewayRoutes(
                tgwConfig['tgw-routes']
                  ?.filter((r) => ['{TGW_ALL}', routeTableName].includes(r.name))
                  .flatMap((routeTable) => routeTable.routes || []) || [],
                accountKey,
                tgwConfig,
              ),
            })),
          });
          if (tgwConfig['tgw-attach']) {
            const tgwPeeringConfig = tgwConfig['tgw-attach'];
            transitGatewayPeering.push({
              name: transitGatewayPeerName(tgwConfig.name, tgwPeeringConfig['associate-to-tgw']),
              requester: {
                transitGatewayName: transitGatewayName(tgwConfig.name),
                account: lzaAccountKey,
                region: tgwConfig.region,
                routeTableAssociations: tgwPeeringConfig['tgw-rt-associate-local'][0], // ASEA has list of route tables to associate to peering
              },
              accepter: {
                transitGatewayName: transitGatewayName(tgwPeeringConfig['associate-to-tgw']),
                account: this.getAccountKeyforLza(globalOptions, tgwPeeringConfig.account),
                region: tgwPeeringConfig.region,
                routeTableAssociations: tgwPeeringConfig['tgw-rt-associate-remote'][0], // ASEA has list of route tables to associate to peering
                autoAccept: true,
              },
            });
          }
        });
      }
      networkConfigAttributes.transitGateways = transitGateways;
      networkConfigAttributes.transitGatewayPeering = transitGatewayPeering;
    };
    const setVpcConfig = async () => {
      const defaultVpcFlowLogsConfig = globalOptions['vpc-flow-logs'];
      const prepareNatGatewayConfig = (vpcConfig: VpcConfig) => {
        if (!vpcConfig.natgw) return;
        const natGatewaySubnets = this.getAzSubnets(vpcConfig, vpcConfig.natgw.subnet.name, vpcConfig.natgw.subnet.az);
        return natGatewaySubnets.map((s) => ({
          name: createNatGatewayName(s.subnetName, s.az),
          subnet: createSubnetName(vpcConfig.name, s.subnetName, s.az),
        }));
      };
      const prepareSecurityGroupRules = (rules: SecurityGroupRuleConfig[], accountKey?: string) => {
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
                securityGroups: source['security-group'].map(securityGroupName),
              });
            } else if (SubnetSourceConfig.is(source)) {
              lzaRule.sources.push({
                account: this.getAccountKeyforLza(globalOptions, source.account || accountKey || ''),
                subnets: source.subnet.flatMap((sourceSubnet) =>
                  aseaConfig
                    .getAzSubnets(source.account || accountKey || '', source.vpc, sourceSubnet)
                    .map((s) => createSubnetName(source.vpc, s.subnetName, s.az)),
                ),
                vpc: createVpcName(source.vpc),
              });
            } else {
              lzaRule.sources.push(source);
            }
          }
          lzaRules.push(lzaRule);
        }
        return lzaRules;
      };

      const prepareSecurityGroupsConfig = (vpcConfig: VpcConfig, accountKey?: string) => {
        const securityGroups = vpcConfig['security-groups'];
        if (!securityGroups) return [];
        return securityGroups.map((sg) => ({
          name: securityGroupName(sg.name),
          inboundRules: prepareSecurityGroupRules(sg['inbound-rules'], accountKey),
          outboundRules: prepareSecurityGroupRules(sg['outbound-rules'], accountKey),
          description: `${vpcConfig.name} Security Group`, // Description can't be updated. Doesn't matter what description we provide here
        }));
      };
      const prepareNaclRules = (rules: NaclConfig[], vpcConfig: VpcConfig, accountKey?: string) => {
        const lzaRules: (LzaNaclInboundRuleType | LzaNaclOutboundRuleType)[] = [];
        for (const rule of rules) {
          let ruleNumber = rule.rule;
          for (const dest of rule['cidr-blocks']) {
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
              const destinationVpcKey = dest.account ?? accountKey;
              const destinationVpcConfig =
                this.vpcConfigs.find((v) => v.accountKey === destinationVpcKey && v.vpcConfig.name === dest.vpc)
                  ?.vpcConfig ?? vpcConfig;
              const ruleSubnets = destinationVpcConfig.subnets
                ?.filter((s) => dest.subnet.includes(s.name))
                .flatMap((s) => this.getAzSubnets(destinationVpcConfig, s.name));
              for (const ruleSubnet of ruleSubnets || []) {
                const target = {
                  account: destinationVpcKey ? this.getAccountKeyforLza(globalOptions, destinationVpcKey) : undefined,
                  subnet: createSubnetName(dest.vpc, ruleSubnet.subnetName, ruleSubnet.az),
                  vpc: createVpcName(dest.vpc),
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
      const prepareNaclConfig = (vpcConfig: VpcConfig, accountKey?: string) => {
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
            inboundRules: prepareNaclRules(inboundRules, vpcConfig, accountKey),
            outboundRules: prepareNaclRules(outboundRules, vpcConfig, accountKey),
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
      const prepareSubnetConfig = (vpcConfig: VpcConfig, ouKey: string, accountKey?: string) => {
        if (!vpcConfig.subnets) return;
        const lzaSubnets: SubnetType[] = [];
        for (const subnetConfig of vpcConfig.subnets) {
          lzaSubnets.push(
            ...subnetConfig.definitions
              .filter((s) => !s.disabled)
              .map((d) => ({
                name: createSubnetName(vpcConfig.name, subnetConfig.name, d.az),
                availabilityZone: d.az,
                ipv4CidrBlock: this.getSubnetCidr({
                  accountKey,
                  cidrSrc: vpcConfig['cidr-src'],
                  region: vpcConfig.region,
                  subnetDefinition: d,
                  subnetName: subnetConfig.name,
                  vpcName: vpcConfig.name,
                }),
                routeTable: createRouteTableName(d['route-table']),
                shareTargets:
                  subnetConfig['share-to-ou-accounts'] || (subnetConfig['share-to-specific-accounts'] ?? []).length > 0
                    ? {
                        organizationalUnits: subnetConfig['share-to-ou-accounts'] ? [ouKey] : undefined,
                        accounts: subnetConfig['share-to-specific-accounts']?.map((lAccountKey) =>
                          this.getAccountKeyforLza(globalOptions, lAccountKey),
                        ),
                      }
                    : undefined,
              })),
          );
        }
        return lzaSubnets;
      };
      const prepareTgwAttachConfig = (vpcConfig: VpcConfig) => {
        const tgwAttach = vpcConfig['tgw-attach'];
        if (!tgwAttach) return;
        return [
          {
            name: createTgwAttachName(vpcConfig.name, tgwAttach['associate-to-tgw']),
            transitGateway: {
              name: transitGatewayName(tgwAttach['associate-to-tgw']),
              account: tgwAttach.account,
            },
            subnets: tgwAttach['attach-subnets']
              ?.flatMap((s) => this.getAzSubnets(vpcConfig, s))
              .map((s) => createSubnetName(vpcConfig.name, s.subnetName, s.az)),
            routeTableAssociations: tgwAttach['tgw-rt-associate'].map((routeTableName) =>
              transitGatewayRouteTableName(routeTableName, tgwAttach['associate-to-tgw']),
            ),
            routeTablePropagations: tgwAttach['tgw-rt-propagate'].map((routeTableName) =>
              transitGatewayRouteTableName(routeTableName, tgwAttach['associate-to-tgw']),
            ),
          },
        ];
      };
      const prepareRouteTableConfig = (vpcConfig: VpcConfig, accountKey?: string) => {
        const prepareRoutes = (routeTable: RouteTableConfig) => {
          const lzaRoutes: {
            name: string;
            type: string;
            destination?: string | { account: string; vpc: string; subnet: string };
            target?: string;
            targetAvailabilityZone?: string;
          }[] = [];
          routeTable.routes?.forEach((route, index) => {
            if (route.target.startsWith('NFW_')) {
              lzaRoutes.push({
                // ASEA only supports cidr destination for NFW Gateway
                name: nfwRouteName(routeTable.name, route.destination as unknown as string),
                type: 'networkFirewall',
                destination: route.destination,
                target: createNetworkFirewallName(vpcConfig.nfw?.['firewall-name']!, this.aseaPrefix),
                targetAvailabilityZone: route.target.split('_az')[1].toLowerCase(),
              });
            } else if (route.target === 'IGW') {
              lzaRoutes.push({
                name: `${routeTable.name}_${route.target}_${index}`,
                type: 'internetGateway',
                destination: route.destination,
              });
            } else if (route.target === 'VGW') {
              lzaRoutes.push({
                name: `${routeTable.name}_${route.target}_${index}`,
                type: 'virtualPrivateGateway',
                destination: route.destination,
              });
            } else if (route.target.toLowerCase() === 's3') {
              lzaRoutes.push({
                name: 'S3Route',
                type: 'gatewayEndpoint',
                target: 's3',
              });
            } else if (route.target.toLowerCase() === 'dynamodb') {
              lzaRoutes.push({
                name: 'DynamoDBRoute',
                type: 'gatewayEndpoint',
                target: 'dynamodb',
              });
            } else if (route.target === 'TGW' && vpcConfig['tgw-attach']) {
              lzaRoutes.push({
                name: `${routeTable.name}_${route.target}_${index}`,
                type: 'transitGateway',
                destination: route.destination,
                target: transitGatewayName(vpcConfig['tgw-attach']['associate-to-tgw']),
              });
            } else if (route.target.startsWith('NATGW_')) {
              lzaRoutes.push({
                name: `${routeTable.name}_natgw_route`,
                type: 'natGateway',
                destination: route.destination,
                target: createNatGatewayName(vpcConfig.natgw!.subnet.name, route.target.split('_az')[1].toLowerCase()),
              });
            } else if (route.target === 'pcx') {
              const destination = route.destination as unknown as PcxRouteConfig;
              const pcxName = vpcConfig.pcx
                ? peeringConnectionName(vpcConfig.name, destination.vpc)
                : peeringConnectionName(destination.vpc, vpcConfig.name);
              let destinationVpcConfig: VpcConfig;
              let destinationSubnet: SubnetConfig;
              if (destination.account === accountKey && vpcConfig.name === destination.vpc) {
                destinationVpcConfig = vpcConfig;
                destinationSubnet = vpcConfig.subnets?.find((subnet) => subnet.name === destination.subnet)!;
              } else {
                destinationVpcConfig = this.vpcConfigs.find(
                  (v) => v.accountKey === destination.account && v.vpcConfig.name === destination.vpc,
                )!.vpcConfig;
                destinationSubnet = destinationVpcConfig.subnets?.find((subnet) => subnet.name === destination.subnet)!;
              }
              destinationSubnet.definitions
                .filter((subnetDef) => !subnetDef.disabled)
                .forEach((subnetDef) => {
                  lzaRoutes.push({
                    name: `${routeTable.name}_pcx_${destination.vpc}_${subnetDef.az}`, // ASEA Used index of subnet. Using az here. Need to change if we can't retrieve routeId
                    type: 'vpcPeering',
                    target: pcxName,
                    destination: this.getSubnetCidr({
                      accountKey: destination.account,
                      cidrSrc: destinationVpcConfig['cidr-src'],
                      region: destinationVpcConfig.region,
                      vpcName: destinationVpcConfig.name,
                      subnetName: destinationSubnet.name,
                      subnetDefinition: subnetDef,
                    }),
                  });
                });
            }
          });
          return lzaRoutes;
        };
        const routeTables = vpcConfig['route-tables'];
        if (!routeTables) return;
        const lzaRouteTables = [];
        for (const routeTable of routeTables) {
          lzaRouteTables.push({
            name: createRouteTableName(routeTable.name),
            routes: prepareRoutes(routeTable),
          });
        }
        return lzaRouteTables;
      };
      const prepareVpcConfig = ({ accountKey, ouKey, vpcConfig, excludeAccounts }: ResolvedVpcConfig) => {
        return {
          name: createVpcName(vpcConfig.name),
          account: accountKey ? this.getAccountKeyforLza(globalOptions, accountKey) : undefined,
          deploymentTargets: !accountKey
            ? {
                organizationalUnits: [ouKey],
                excludedAccounts: excludeAccounts?.map((excludeAccountKey) =>
                  this.getAccountKeyforLza(globalOptions, excludeAccountKey),
                ),
              }
            : undefined,
          cidrs: this.getVpcCidr({ accountKey, vpcConfig, ouKey }),
          region: vpcConfig.region,
          defaultSecurityGroupRulesDeletion: true,
          enableDnsHostnames: true,
          enableDnsSupport: true,
          gatewayEndpoints:
            vpcConfig['gateway-endpoints'] && vpcConfig['gateway-endpoints'].length > 0
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
          networkAcls: prepareNaclConfig(vpcConfig, accountKey),
          vpcFlowLogs: prepareVpcFlowLogs(vpcConfig['flow-logs']),
          subnets: prepareSubnetConfig(vpcConfig, ouKey, accountKey),
          transitGatewayAttachments: prepareTgwAttachConfig(vpcConfig),
          virtualPrivateGateway: vpcConfig.vgw,
          routeTables: prepareRouteTableConfig(vpcConfig, accountKey),
          // TODO: Comeback after customizationConfig
          // loadBalancers:
          // targetGroups:
        };
      };
      const lzaVpcConfigs = [];
      const lzaVpcTemplatesConfigs = [];
      for (const { accountKey, vpcConfig, ouKey, excludeAccounts } of this.vpcConfigs) {
        if (vpcConfig.deploy !== 'local' && vpcConfig.deploy !== accountKey) {
          console.error(
            `Invalid VPC configuration found VPC: "${vpcConfig.name}" in Account: "${accountKey}" and OU: "${ouKey}"`,
          );
          continue;
        }
        if (!!accountKey) {
          lzaVpcConfigs.push(prepareVpcConfig({ accountKey, vpcConfig, ouKey }));
        } else {
          lzaVpcTemplatesConfigs.push(prepareVpcConfig({ ouKey, vpcConfig, excludeAccounts, accountKey }));
        }
      }
      networkConfigAttributes.vpcs = lzaVpcConfigs;
      networkConfigAttributes.vpcTemplates = lzaVpcTemplatesConfigs;
    };
    const setVpcPeeringConfig = async () => {
      if (this.vpcConfigs.length === 0) return;
      networkConfigAttributes.vpcPeering = this.vpcConfigs
        .filter(({ vpcConfig }) => !!vpcConfig.pcx)
        .map(({ vpcConfig }) => ({
          name: peeringConnectionName(vpcConfig.name, vpcConfig.pcx!['source-vpc']),
          vpcs: [createVpcName(vpcConfig.name), createVpcName(vpcConfig.pcx!['source-vpc'])],
        }));
    };
    await setCertificatesConfig();
    await setVpcConfig();
    await setTransitGatewaysAndPeeringConfig();
    await setVpcPeeringConfig();
    const networkConfig = NetworkConfig.loadFromString(JSON.stringify(networkConfigAttributes));
    const yamlConfig = yaml.dump(networkConfig, { noRefs: true });
    await writeConfig(path.join(this.outputFolder, NetworkConfig.FILENAME), yamlConfig);
  }

  // async prepareCustomerGateways(aseaConfig: AcceleratorConfig) {
  //   const setCustomerGatewayConfig = (firewallConfig: FirewallEC2ConfigType | FirewallCGWConfigType, accountKey: string) => {
  //     const cgwRouting = firewallConfig['fw-cgw-routing'].toLowerCase();
  //     const asn = firewallConfig['fw-cgw-asn'];
  //     const firewallCgwName = cgwRouting === 'dynamic'? firewallConfig['fw-cgw-name']: 65000;
  //     let ipAddress = '';
  //     const customerGateways: CustomerGatewayConfig[] = [];
  //     const attachConfig = firewallConfig['tgw-attach'] as TransitGatewayAttachConfig;
  //     if (FirewallCGWConfigType.is(firewallConfig)) {
  //       for (const [index, fwIp] of Object.entries(firewallConfig['fw-ips'] || [])) {
  //         const prefix = `${firewallCgwName}_ip${index}`;
  //         const customerGateway: CustomerGatewayConfig = {
  //           name: `${prefix}_cgw`,
  //           account: this.getAccountKeyforLza(aseaConfig['global-options'], accountKey),
  //           region: firewallConfig.region as Region,
  //           asn,
  //           tags: [],
  //           ipAddress: fwIp,
  //           vpnConnections: [{
  //             name: `${prefix}_vpn`,
  //             routeTableAssociations: attachConfig['tgw-rt-associate'],
  //             routeTablePropagations: attachConfig['tgw-rt-propagate'],
  //             staticRoutesOnly: cgwRouting === 'static',
  //             tags: [],
  //             transitGateway: attachConfig['associate-to-tgw'],
  //             tunnelSpecifications: [{
  //               preSharedKey: '',
  //               tunnelInsideCidr: '',
  //             }],
  //             vpc: undefined,
  //           }],
  //         }
  //       }
  //     }

  //   }
  //   for (const [accountKey, accountConfig] of aseaConfig
  //     .getAccountConfigs()
  //     .filter(([_accountKey, accountConfig]) => (accountConfig.deployments?.firewalls || []).length > 0)) {
  //       const firewalls = accountConfig.deployments?.firewalls ?? [];
  //       for (const firewallConfig of firewalls) {
  //         if (FirewallAutoScaleConfigType.is(firewallConfig) || !TransitGatewayAttachConfigType.is(firewallConfig['tgw-attach'])) continue;
  //         setCustomerGatewayConfig(firewallConfig, accountKey);
  //       }
  //   }
  // }

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

  private getVpcCidr({ accountKey, vpcConfig, ouKey }: { accountKey?: string; vpcConfig: VpcConfig; ouKey?: string }) {
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
                ((accountKey && vc['account-key'] === accountKey) ||
                  (ouKey && vc['account-ou-key'] === `organizational-unit/${ouKey}`)) &&
                vc.pool === c.pool &&
                vc.region === vpcConfig.region &&
                vc['vpc-name'] === vpcConfig.name &&
                vc.status === 'assigned',
            )?.cidr!,
          );
        }
      });
    }
    return cidrs;
  }

  private getSubnetCidr({
    accountKey,
    cidrSrc,
    region,
    subnetDefinition,
    subnetName,
    vpcName,
    ouKey,
  }: {
    cidrSrc: string;
    region: string;
    vpcName: string;
    subnetName: string;
    subnetDefinition: SubnetDefinitionConfig;
    accountKey?: string;
    ouKey?: string;
  }) {
    let ipv4CidrBlock: string;
    if (cidrSrc === 'provided' || subnetDefinition.cidr?.value) {
      ipv4CidrBlock = subnetDefinition.cidr?.value?.toCidrString()!;
    } else {
      ipv4CidrBlock = this.subnetAssignedCidrs.find(
        (sc) =>
          ((accountKey && sc['account-key'] === accountKey) ||
            (ouKey && sc['account-ou-key'] === `organizational-unit/${ouKey}`)) &&
          sc.region === region &&
          sc['vpc-name'] === vpcName &&
          sc['subnet-name'] === subnetName &&
          sc.az === subnetDefinition.az &&
          sc['subnet-pool'] === subnetDefinition.cidr?.pool,
      )?.cidr!;
    }
    return ipv4CidrBlock;
  }
}
