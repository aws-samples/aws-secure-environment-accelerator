/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */
import * as fs from 'fs';
import path from 'path';
import * as yaml from 'js-yaml';
import _ from 'lodash';
import {
  AcceleratorConfig,
  AlbConfigType,
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
  VpcFlowLogsDestinationConfig,
} from './asea-config';
import { loadAseaConfig } from './asea-config/load';
import * as WriteToSourcesTypes from './common//utils/types/writeToSourcesTypes';
import { DynamoDB } from './common/aws/dynamodb';
import { KMS } from './common/aws/kms';
import { Organizations } from './common/aws/organizations';
import { S3 } from './common/aws/s3';
import { SSM } from './common/aws/ssm';
import { STS } from './common/aws/sts';
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
  createAlbName,
  createConfigRuleName,
  createNaclName,
  createNatGatewayName,
  createNetworkFirewallName,
  createNetworkFirewallPolicyName,
  createNetworkFirewallRuleGroupName,
  createRouteTableName,
  createScpName,
  createSsmDocumentName,
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
import * as ConvertConfigTypes from './common/utils/types/convertConfigTypes';
import { WriteToSources } from './common/utils/writeToSources';
import { Config } from './config';
import { AccountsConfig, AccountsConfigType } from './config/accounts-config';
import { Region, ShareTargets } from './config/common-types';
import {
  ApplicationLoadBalancerConfig,
  BlockDeviceMappingItem,
  CustomizationsConfig,
  CustomizationsConfigTypes,
  Ec2FirewallConfig,
  Ec2FirewallInstanceConfig,
  LaunchTemplateConfig,
  NetworkInterfaceItemConfig,
  TargetGroupItemConfig,
} from './config/customizations-config';
import { GlobalConfig } from './config/global-config';
import {
  AssumedByConfig,
  GroupConfig,
  IamConfig,
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
import { ConfigCheck } from './inventory/config-checks';

const IAM_POLICY_CONFIG_PATH = 'iam-policy';
const SCP_CONFIG_PATH = 'scp';
const SSM_DOCUMENTS_CONFIG_PATH = 'ssm-documents';
const CONFIG_RULES_PATH = 'config-rules';
const LZA_SCP_CONFIG_PATH = 'service-control-policies';
const LZA_CONFIG_RULES = 'custom-config-rules';
const LZA_BUCKET_POLICY = 'bucket-policies';
const LZA_KMS_POLICY = 'kms-policies';
const LZA_IAM_POLICY_CONFIG_PATH = 'iam-policies';
const LZA_CLOUDFORMATION = 'cloudformation';

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

const CloudFormationAssets: { [key: string]: string } = {
  'ALB-IP-FORWARDING': path.join(LZA_CLOUDFORMATION, 'AlbIpForwardingStack.template.json'),
};

const SnsFindingTypesDict = {
  Low: 'Low',
  Medium: 'Medium',
  High: 'High',
  Critical: 'High',
  INFORMATIONAL: 'Low',
  None: 'Low',
};

type DocumentSet = {
  shareTargets: { organizationalUnits?: string[]; accounts?: string[] };
  documents: { name: string; template: string }[];
};

export class ConvertAseaConfig {
  private localUpdateOnly = false; // This is an option to not write config changes to codecommit, used only for development like yarn run convert-config local-update-only. Default is true
  private disableTerminationProtection = false;
  private readonly aseaConfigRepositoryName: string;
  private readonly region: string;
  private readonly aseaPrefix: string;
  private readonly centralBucketName: string;
  private readonly lzaConfigRepositoryName: string;
  private readonly parametersTable: string;
  private readonly mappingFileBucket: string;
  private readonly localConfigFilePath?: string;
  private readonly s3: S3;
  private readonly sts: STS;
  private readonly dynamoDb: DynamoDB;
  private readonly organizations = new Organizations();
  private readonly acceleratorName: string;
  private readonly writeFilesConfig: WriteToSourcesTypes.WriteToSourcesConfig;
  private readonly ouToNestedOuMap: Map<string, Set<string>> = new Map();
  private accounts: Account[] = [];
  private outputs: StackOutput[] = [];
  private vpcAssignedCidrs: VpcAssignedCidr[] = [];
  private subnetAssignedCidrs: SubnetAssignedCidr[] = [];
  private vpcConfigs: ResolvedVpcConfig[] = [];
  private globalOptions: GlobalOptionsConfig | undefined;
  private ssmClients: { [region: string]: SSM } = {};
  private lzaAccountKeys: string[] | undefined;
  private regionsWithoutVpc: string[] = [];
  private accountsWithoutVpc: string[] = [];
  private accountsWithVpc: Set<string> = new Set<string>([]);
  private albs: AlbConfigType[] = [];
  private writeToSources: WriteToSources;
  private configCheck: ConfigCheck = new ConfigCheck();
  private documentSets: DocumentSet[] = [];

  constructor(config: Config) {
    this.localUpdateOnly = config.localOnlyWrites ?? false;
    this.disableTerminationProtection = config.disableTerminationProtection ?? false;
    this.aseaConfigRepositoryName = config.repositoryName;
    this.localConfigFilePath = config.localConfigFilePath ?? undefined;
    this.region = config.homeRegion;
    this.centralBucketName = config.centralBucket!;
    this.aseaPrefix = config.aseaPrefix!.endsWith('-') ? config.aseaPrefix! : `${config.aseaPrefix}-`;
    this.parametersTable = `${this.aseaPrefix}Parameters`;
    this.acceleratorName = config.acceleratorName!;
    this.sts = new STS();
    this.s3 = new S3(undefined, this.region);
    this.dynamoDb = new DynamoDB(undefined, this.region);
    this.lzaConfigRepositoryName = config.lzaConfigRepositoryName;
    this.mappingFileBucket = config.mappingBucketName;
    this.writeFilesConfig = {
      localOnly: this.localUpdateOnly,
      codeCommitConfig: {
        branch: 'main',
        repository: this.lzaConfigRepositoryName,
      },
      s3Config: {
        bucket: this.mappingFileBucket,
        baseDirectory: 'outputs/lza-config',
      },
      localConfig: {
        baseDirectory: 'outputs/lza-config',
      },
      region: config.homeRegion,
    };

    this.writeToSources = new WriteToSources(this.writeFilesConfig);
  }

  async process() {
    const aseaConfig = await loadAseaConfig({
      filePath: 'raw/config.json',
      repositoryName: this.aseaConfigRepositoryName,
      defaultRegion: this.region,
      localFilePath: this.localConfigFilePath,
    });
    this.accounts = await loadAccounts(this.parametersTable, this.dynamoDb);
    this.vpcAssignedCidrs = await loadVpcAssignedCidrs(vpcCidrsTableName(this.aseaPrefix), this.dynamoDb);
    this.subnetAssignedCidrs = await loadSubnetAssignedCidrs(subnetsCidrsTableName(this.aseaPrefix), this.dynamoDb);
    this.outputs = await loadOutputs(`${this.aseaPrefix}Outputs`, this.dynamoDb);
    this.globalOptions = aseaConfig['global-options'];
    this.vpcConfigs = aseaConfig.getVpcConfigs();
    const regionsWithVpc = this.vpcConfigs.map((resolvedConfig) => resolvedConfig.vpcConfig.region);
    this.regionsWithoutVpc = this.globalOptions['supported-regions'].filter(
      (region) => !regionsWithVpc.includes(region),
    );
    const accountKeys = aseaConfig.getAccountConfigs().map(([accountKey]) => accountKey);
    this.accountsWithVpc = new Set<string>();
    this.albs = aseaConfig.getAlbConfigs();
    //this.albTemplates = aseaConfig.getAlbTemplateConfigs();
    /**
     * Loop VPC Configs and get accounts and regions with VPC
     * Compute accounts and regions with out VPC to exclude for EBS Default Encryption and sessionManager configuration.
     */
    for (const { ouKey, vpcConfig, accountKey, excludeAccounts } of this.vpcConfigs) {
      if (!!accountKey) {
        this.accountsWithVpc.add(accountKey);
      } else {
        aseaConfig
          .getAccountConfigsForOu(ouKey)
          .map(([account]) => account)
          .forEach((account) => this.accountsWithVpc.add(account));
      }
      for (const subnetConfig of vpcConfig.subnets ?? []) {
        if (subnetConfig['share-to-ou-accounts']) {
          aseaConfig
            .getAccountConfigsForOu(ouKey)
            .filter(([account]) => !excludeAccounts?.includes(account))
            .map(([account]) => account)
            .forEach((account) => this.accountsWithVpc.add(account));
        }
        if (!!subnetConfig['share-to-specific-accounts']) {
          subnetConfig['share-to-specific-accounts'].forEach((account) => this.accountsWithVpc.add(account));
        }
      }
    }
    this.accountsWithoutVpc = accountKeys
      .filter((accountKey) => !this.accountsWithVpc.has(accountKey))
      .map((accountKey) => this.getAccountKeyforLza(this.globalOptions!, accountKey));
    if (this.accountsWithVpc.has('management')) {
      this.accountsWithVpc.delete('management');
      this.accountsWithVpc.add('Management');
    }
    const index = this.accountsWithoutVpc.findIndex((x) => x === 'management');
    if (index) {
      this.accountsWithoutVpc[index] = 'Management';
    }

    await this.copyAdditionalAssets();
    await this.configCheck.checkUnsupportedConfig(aseaConfig);
    await this.prepareOrganizationConfig(aseaConfig);
    await this.prepareIamConfig(aseaConfig);
    await this.prepareGlobalConfig(aseaConfig);
    this.lzaAccountKeys = await this.prepareAccountConfig(aseaConfig);
    await this.prepareSecurityConfig(aseaConfig);
    await this.prepareNetworkConfig(aseaConfig);
    await this.prepareCustomizationsConfig(aseaConfig);
    await this.createDynamicPartitioningFile(aseaConfig);
    this.rsyslogWarnings(aseaConfig);
    this.madWarnings(aseaConfig);

    this.configCheck.printWarnings();
    this.configCheck.printErrors();
  }
  /**
   * Copy additional assets which are required for LZA
   */
  private async copyAdditionalAssets() {
    const filesToWrite = [];
    filesToWrite.push(...this.generatePutFiles(Object.values(ConfigRuleRemediationAssets), LZA_CONFIG_RULES));
    filesToWrite.push(...this.generatePutFiles(Object.values(ConfigRuleDetectionAssets), LZA_CONFIG_RULES));
    filesToWrite.push(...this.generatePutFiles(Object.values(CloudFormationAssets), LZA_CLOUDFORMATION));
    await this.writeToSources.writeFiles(filesToWrite);
  }

  private generatePutFiles(fileNames: string[], directory: string): WriteToSourcesTypes.PutFiles[] {
    return fileNames.map((dir) => {
      const fileNameArr = dir.split('/');
      const fileName = fileNameArr.pop()!;
      const relativePath = fileNameArr.pop()!;
      const content = fs.readFileSync(path.join(__dirname, 'assets', relativePath, fileName)).toString();
      return {
        fileContent: content,
        filePath: directory,
        fileName,
      };
    });
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
    for (const { vpcConfig, accountKey, lzaVpcName } of nfwVpcConfigs) {
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
        vpc: createVpcName(lzaVpcName ?? vpcConfig.name),
        subnets: this.getAzSubnets(vpcConfig, networkFirewallConfig.subnet.name).map((subnet) =>
          createSubnetName(lzaVpcName ?? vpcConfig.name, subnet.subnetName, subnet.az),
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
    const centralLogBucketOutput = findValuesFromOutputs({
      outputs: this.outputs,
      accountKey: this.globalOptions?.['central-log-services'].account,
      region: this.region,
      predicate: (o) => o.type === 'LogBucket',
    })?.[0];
    const centralLogBucket = centralLogBucketOutput.value.bucketName;
    const centralLogBucketArn = centralLogBucketOutput.value.bucketArn;
    const centralLogEncryptionKey = centralLogBucketOutput.value.encryptionKeyArn;
    const logAccountId = getAccountId(
      this.accounts,
      this.globalOptions?.['central-log-services'].account ?? 'log-archive',
    )!;
    const logAccountCredentials = await this.sts.getCredentialsForAccountAndRole(
      logAccountId,
      `${this.aseaPrefix}PipelineRole`,
    );
    const s3 = new S3(logAccountCredentials, this.region);
    const kms = new KMS(logAccountCredentials, this.region);
    const centralLogBucketPolicy = await s3.getBucketPolicy({
      Bucket: centralLogBucket,
    });
    // GuardDuty and Macie related permissions
    if (
      !centralLogBucketPolicy.Statement.find(
        (policyStatement: { Sid: string }) => policyStatement.Sid === 'GuardDuty_Macie_Permissions',
      )
    ) {
      centralLogBucketPolicy.Statement.push({
        Sid: 'GuardDuty_Macie_Permissions',
        Effect: 'Allow',
        Principal: {
          Service: ['macie.amazonaws.com', 'guardduty.amazonaws.com'],
        },
        Action: [
          's3:GetObject*',
          's3:GetBucket*',
          's3:List*',
          's3:DeleteObject*',
          's3:PutObject',
          's3:PutObjectLegalHold',
          's3:PutObjectRetention',
          's3:PutObjectTagging',
          's3:PutObjectVersionTagging',
          's3:Abort*',
        ],
        Resource: [centralLogBucketArn, `${centralLogBucketArn}/*`],
      });
    }

    // Add GetEncryptionContext for GuardDuty and Macie
    if (
      !centralLogBucketPolicy.Statement.find(
        (policyStatement: { Sid: string }) => policyStatement.Sid === 'GetEncryptionContext',
      )
    ) {
      centralLogBucketPolicy.Statement.push({
        Sid: 'GetEncryptionContext',
        Effect: 'Allow',
        Principal: {
          AWS: '*',
        },
        Action: ['s3:GetEncryptionConfiguration', 's3:GetBucketAcl'],
        Resource: centralLogBucketArn,
        Condition: {
          StringEquals: {
            'aws:PrincipalOrgID': '${ORG_ID}',
          },
        },
      });
    }
    // Allow Organizations usage
    if (
      !centralLogBucketPolicy.Statement.find(
        (policyStatement: { Sid: string }) => policyStatement.Sid === 'AllowOrganizationUsage',
      )
    ) {
      centralLogBucketPolicy.Statement.push({
        Sid: 'AllowOrganizationUsage',
        Effect: 'Allow',
        Principal: {
          AWS: '*',
        },
        Action: ['s3:GetBucketLocation', 's3:GetBucketAcl', 's3:PutObject', 's3:GetObject', 's3:ListBucket'],
        Resource: [centralLogBucketArn, `${centralLogBucketArn}/*`],
        Condition: {
          StringEquals: {
            'aws:PrincipalOrgID': '${ORG_ID}',
          },
        },
      });
    }
    const centralLogBucketPolicyFile = path.join(LZA_BUCKET_POLICY, 'central-log-bucket.json');
    await this.writeToSources.writeFiles([
      {
        fileContent: JSON.stringify(centralLogBucketPolicy, null, 2),
        fileName: 'central-log-bucket.json',
        filePath: LZA_BUCKET_POLICY,
      },
    ]);
    const centralLogKeyPolicyFile = path.join(LZA_KMS_POLICY, 'central-log-bucket-key.json');
    const centralLogKeyPolicy = await kms.getKeyPolicy({
      KeyId: centralLogEncryptionKey,
      PolicyName: 'default',
    });
    if (
      !centralLogKeyPolicy.Statement.find(
        (policyStatement: { Sid: string }) => policyStatement.Sid === 'ConfigPermissions',
      )
    ) {
      centralLogKeyPolicy.Statement.push({
        Sid: 'ConfigPermissions',
        Effect: 'Allow',
        Principal: {
          Service: ['config.amazonaws.com'],
        },
        Action: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
        Resource: '*',
      });
    }
    if (
      !centralLogKeyPolicy.Statement.find(
        (policyStatement: { Sid: string }) => policyStatement.Sid === 'GuardDuty_Macie_Permissions',
      )
    ) {
      centralLogKeyPolicy.Statement.push({
        Sid: 'GuardDuty_Macie_Permissions',
        Effect: 'Allow',
        Principal: {
          Service: ['macie.amazonaws.com', 'guardduty.amazonaws.com'],
        },
        Action: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
        Resource: '*',
      });
    }
    await this.writeToSources.writeFiles([
      {
        fileContent: JSON.stringify(centralLogKeyPolicy, null, 2),
        fileName: 'central-log-bucket-key.json',
        filePath: LZA_KMS_POLICY,
      },
    ]);
    const ssmRoleNames: string[] = [];
    aseaConfig.getAccountConfigs().forEach(([_accountKey, accountConfig]) => {
      ssmRoleNames.push(
        ...(accountConfig.iam?.roles ?? [])
          .filter(
            (role) =>
              role['ssm-log-archive-access'] ||
              role['ssm-log-archive-read-only-access'] ||
              role['ssm-log-archive-write-access'],
          )
          .map((role) => role.role),
      );
    });

    aseaConfig.getOrganizationConfigs().forEach(([_ouKey, ouConfig]) => {
      ssmRoleNames.push(
        ...(ouConfig.iam?.roles ?? [])
          .filter(
            (role) =>
              role['ssm-log-archive-access'] ||
              role['ssm-log-archive-read-only-access'] ||
              role['ssm-log-archive-write-access'],
          )
          .map((role) => role.role),
      );
    });

    // Create regions exclusion list for CMK
    const excludeRegions: string[] = [];
    for (const regionItem of globalOptions['supported-regions']) {
      if (regionItem !== globalOptions['aws-org-management'].region) {
        excludeRegions.push(regionItem);
      }
    }

    const ousForS3EncryptionDeploymentTargetsWithoutNestedOus = Object.entries(aseaConfig['organizational-units']).map(([ouName]) => ouName);
    const ouForS3EncrpyionDeploymentTargetsWithOus = this.getNestedOusForDeploymentTargets(ousForS3EncryptionDeploymentTargetsWithoutNestedOus);

    const globalConfigAttributes: { [key: string]: unknown } = {
      externalLandingZoneResources: {
        importExternalLandingZoneResources: true,
        acceleratorPrefix: this.aseaPrefix.replaceAll('-', ''),
        acceleratorName: this.acceleratorName,
        mappingFileBucket: this.mappingFileBucket,
      },
      homeRegion: this.region,
      enabledRegions: globalOptions['supported-regions'],
      managementAccountAccessRole: globalOptions['organization-admin-role'] || 'OrganizationAccountAccessRole',
      cloudwatchLogRetentionInDays: LOG_RETENTION.includes(globalOptions['default-cwl-retention'])
        ? globalOptions['default-cwl-retention']
        : 3653,
      terminationProtection: this.disableTerminationProtection,
      controlTower: { enable: globalOptions['ct-baseline'] },
      cdkOptions: {
        centralizeBuckets: true,
        useManagementAccessRole: false,
        customDeploymentRole: `${this.aseaPrefix}LZA-DeploymentRole`,
      },
      lambda: {
        encryption: {
          useCMK: false,
        },
      },
      s3: {
        encryption: {
          createCMK: true,
          deploymentTargets: {
            accounts: ['Management'],
            organizationalUnits: ouForS3EncrpyionDeploymentTargetsWithOus,
            excludedRegions: excludeRegions,
          },
        },
      },
      logging: {
        account: this.getAccountKeyforLza(globalOptions, centralizeLogging.account),
        centralizedLoggingRegion: centralizeLogging.region,
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
          attachPolicyToIamRoles: Array.from(new Set(ssmRoleNames)),
          excludeRegions: this.regionsWithoutVpc,
          excludeAccounts: this.accountsWithoutVpc,
        },
        // No option to customize on ASEA apart from expiration/retention
        accessLogBucket: {
          enable: false,
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
          importedBucket: {
            name: centralLogBucket,
          },
          customPolicyOverrides: {
            s3Policy: centralLogBucketPolicyFile,
            kmsPolicy: centralLogKeyPolicyFile,
          },
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
        //
        cloudwatchLogs: {
          enable: true,
          encryption: {
            useCMK: true,
            deploymentTargets: {
              organizationalUnits: ['Root'],
              excludedRegions: this.regionsWithoutVpc ?? undefined,
            },
          },
          dynamicPartitioning: dynamicLogPartitioning ? 'dynamic-partitioning/log-filters.json' : undefined,
          replaceLogDestinationArn: `arn:aws:logs:${this.region}:${logAccountId}:destination/${this.aseaPrefix}LogDestinationOrg`,
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
      acceleratorMetadata: this.buildAcceleratorMetadata(aseaConfig),
      ssmInventory: this.buildSsmInventory(aseaConfig),
    };

    const globalConfig = GlobalConfig.fromObject(globalConfigAttributes);
    const yamlConfig = yaml.dump(globalConfig, { noRefs: true });
    await this.writeToSources.writeFiles([{ fileContent: yamlConfig, fileName: GlobalConfig.FILENAME }]);
  }

  private getNestedOusForDeploymentTargets(ousWithoutNestedOus: string[]) {
    let ouWithNestedOus = ousWithoutNestedOus;
    for (const ouWithoutNestedOus of ousWithoutNestedOus) {
      if (this.ouToNestedOuMap.has(ouWithoutNestedOus)) {
        const nestedOusForOu = this.ouToNestedOuMap.get(ouWithoutNestedOus);
        if (nestedOusForOu) {
          const nestedOuSet = this.ouToNestedOuMap.get(ouWithoutNestedOus);
          if (nestedOuSet) {
            ouWithNestedOus = [...ouWithNestedOus, ... Array.from(nestedOuSet)];
          }
        }
      }
    }

    return ouWithNestedOus;
  }

  private buildAcceleratorMetadata(aseaConfig: AcceleratorConfig) {
    let loggingAccount;
    const metadataCollection = aseaConfig['global-options']['meta-data-collection'];
    if (!metadataCollection) {
      return;
    }
    const readOnlyAccessRoleArns = this.getReadOnlyAccessRoleArns(aseaConfig);
    if (this.globalOptions) {
      loggingAccount = this.getAccountKeyforLza(
        aseaConfig['global-options'],
        this.globalOptions?.['central-log-services'].account,
      );
    }
    return {
      enable: true,
      account: loggingAccount,
      readOnlyAccessRoleArns,
    };
  }

  private getReadOnlyAccessRoleArns(aseaConfig: AcceleratorConfig) {
    const accountRoleArnsList: string[][] = [];
    const orgRoleArnsList: string[][] = [];

    // Iterate through all accounts and find roles with meta-data-read-only-access defined and generate arn.
    aseaConfig.getAccountConfigs().forEach(([_accountKey, accountConfig]) => {
      const roles = accountConfig.iam?.roles ?? [];
      const filteredAccountRoles = roles.filter((role) => role['meta-data-read-only-access']);
      const accountId = getAccountId(this.accounts, _accountKey);
      accountRoleArnsList.push(filteredAccountRoles.map((role) => `arn:aws:iam:${accountId}:role/${role.role}`));
    });

    // Iterate through all orgs, look up accounts, and find roles with meta-data-read-only-access defined and generate arn.
    aseaConfig.getOrganizationConfigs().forEach(([_ouKey, ouConfig]) => {
      const roles = ouConfig.iam?.roles ?? [];
      const filteredRoles = roles.filter((role) => role['meta-data-read-only-access']);
      const organizationAccountIds = this.accounts
        .filter((account) => account.ou === _ouKey)
        .map((ouAccount) => ouAccount.id);
      for (const organizationAccountId of organizationAccountIds) {
        orgRoleArnsList.push(filteredRoles.map((role) => `arn:aws:iam:${organizationAccountId}:role/${role.role}`));
      }
    });

    // Convert both account and org role arns lists to flat lists so its a single list rather than list of lists.
    const accountRoleArns = accountRoleArnsList.flat();
    const orgRoleArns = orgRoleArnsList.flat();
    // Convert to set in-case role arn is created from both OU and account config
    const readOnlyAccessRoleArnsSet = new Set([...accountRoleArns, ...orgRoleArns]);
    const readOnlyAccessRoleArns = Array.from(readOnlyAccessRoleArnsSet);

    return readOnlyAccessRoleArns;
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
        name: `${this.aseaPrefix}${budget.name}`,
        amount: budget.amount,
        type: 'COST', // ASEA, Only creates COST Report
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
          address: alert.emails[0].toLocaleLowerCase(), // TODO: Confirm about using only zero index. ASEA Code supports multiple subscriber emails
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
      const ous = this.getNestedOusForDeploymentTargets([ouName]);
      budgets.push({
        name: budget.name,
        amount: budget.amount,
        type: 'COST', // ASEA, Only creates COST Report
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
          address: alert.emails[0].toLocaleLowerCase(), // TODO: Confirm about using only zero index. ASEA Code supports multiple subscriber emails
          subscriptionType: 'EMAIL',
        })),
        deploymentTargets: {
          organizationalUnits: ous,
          excludedAccounts: budgetCreatedToAccounts,
        },
      });
    });
    return budgets;
  }

  private buildSnsTopics(aseaConfig: AcceleratorConfig) {
    if (!aseaConfig['global-options']['central-log-services']['sns-subscription-emails']) return;
    const alarmsConfig = aseaConfig['global-options'].cloudwatch?.alarms;

    const snsTopics: string[] = [];
    for (const alarmItem of alarmsConfig?.definitions! ?? []) {
      if (!snsTopics.includes(alarmItem['sns-alert-level']) && alarmItem['sns-alert-level'] !== 'Ignore') {
        snsTopics.push(alarmItem['sns-alert-level']);
      }
    }
    return {
      // Set deploymentTargets to Root Org since we need sns topics in all accounts
      deploymentTargets: {
        accounts: [
          this.getAccountKeyforLza(aseaConfig['global-options'], this.globalOptions!['aws-org-management'].account),
          this.getAccountKeyforLza(
            aseaConfig['global-options'],
            this.globalOptions!['central-security-services'].account,
          ),
        ],
      },

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
    let ssmInventoryAccounts = aseaConfig
      .getAccountConfigs()
      .filter(([_accountKey, accountConfig]) => !!accountConfig['ssm-inventory-collection'])
      .map(([accountKey]) => this.getAccountKeyforLza(aseaConfig['global-options'], accountKey));
    let ssmInventoryOus = Object.entries(aseaConfig['organizational-units'])
      .filter(([_accountKey, ouConfig]) => !!ouConfig['ssm-inventory-collection'])
      .map(([ouKey]) => ouKey);
    const ssmInventoryOusWithNestedOus = this.getNestedOusForDeploymentTargets(ssmInventoryOus);
    if (ssmInventoryAccounts.length === 0 && ssmInventoryOus.length === 0) return;
    if (ssmInventoryAccounts.length === 0) {
      return {
        enable: true,
        deploymentTargets: {
          organizationalUnits: ssmInventoryOusWithNestedOus,
        },
      };
    } else {
      return {
        enable: true,
        deploymentTargets: {
          accounts: ssmInventoryAccounts,
        },
      };
    }
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
    const policySets: PolicySetConfigType[] = [];
    const getPolicyConfig = async (policy: IamPolicyConfig, ouKey?: string, accountKey?: string) => {
      const currentIndex = policySets.findIndex((ps) => ps.policies.find((p) => p.name === policy['policy-name']));
      if (currentIndex === -1) {
        const policyData = await this.s3.getObjectBodyAsString({
          Bucket: this.centralBucketName,
          Key: path.join(IAM_POLICY_CONFIG_PATH, policy.policy),
        });
        const fileName = `${policy.policy.split('.').slice(0, -1).join('.')}.json`;
        const newFileName = path.join(
          LZA_IAM_POLICY_CONFIG_PATH,
          `${policy.policy.split('.').slice(0, -1).join('.')}.json`,
        );

        await this.writeToSources.writeFiles([
          { fileContent: policyData, fileName, filePath: LZA_IAM_POLICY_CONFIG_PATH },
        ]);

        // Deploy Default-Boundary-Policy into every account
        if (policy['policy-name'] === 'Default-Boundary-Policy') {
          ouKey = 'Root';
          accountKey = undefined;
        }
        policySets.push({
          deploymentTargets: {
            accounts: accountKey ? [accountKey] : [],
            organizationalUnits: ouKey ? this.getNestedOusForDeploymentTargets([ouKey]) : [],
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
      // Deploy Default-Boundary-Policy into every account
      if (policy['policy-name'] !== 'Default-Boundary-Policy') {
        if (accountKey) policySets[currentIndex].deploymentTargets.accounts?.push(accountKey);
        if (ouKey) {
          const ous = this.getNestedOusForDeploymentTargets([ouKey]);
          for (const ou of ous) {
            policySets[currentIndex].deploymentTargets.organizationalUnits?.push(ou);
          }
        }
      }
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
        if (role['source-account'] && role['source-account-role']) {
          assumedBy.push({
            type: 'principalArn',
            principal: `arn:aws:iam::${getAccountId(this.accounts, role['source-account'])}:role/${role['source-account-role']}`,
          });
        }
        if (role['source-account'] && !role['source-account-role']) {
          assumedBy.push({
            type: 'account',
            principal: `arn:aws:iam::${getAccountId(this.accounts, role['source-account'])}:root`,
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
          roles: [
            {
              name: role.role,
              assumedBy,
              boundaryPolicy: role['boundary-policy'],
              policies: {
                awsManaged: role.policies.filter((policy) => !(existingCustomerManagerPolicies || []).includes(policy)),
                customerManaged: role.policies.filter((policy) =>
                  (existingCustomerManagerPolicies || []).includes(policy),
                ),
              },
              instanceProfile: role.type === 'ec2',
              externalIds: await this.prepareExternalIdsConfig(role),
            },
          ],
          deploymentTargets: {
            accounts: accountKey ? [accountKey] : [],
            excludedAccounts: undefined,
            excludedRegions: undefined,
            organizationalUnits: ouKey ? this.getNestedOusForDeploymentTargets([ouKey]) : [],
          },
          path: undefined,
        });
        return;
      }
      if (accountKey) {
        roleSets[currentIndex].deploymentTargets.accounts?.push(accountKey);
      }
      if (ouKey) {
        const ous = this.getNestedOusForDeploymentTargets([ouKey]);
        for (const ou of ous) {
          roleSets[currentIndex].deploymentTargets.organizationalUnits?.push(ou);
        }
      }
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
            organizationalUnits: this.getNestedOusForDeploymentTargets([ouKey]),
          },
          users,
        });
        groupSets.push({
          deploymentTargets: {
            organizationalUnits: this.getNestedOusForDeploymentTargets([ouKey]),
          },
          groups,
        });
      }
    }

    // Add policy for SSMWriteAccessPolicy
    await this.addSSMWriteAccessPolicy(aseaConfig, policySets);

    iamConfigAttributes.policySets = policySets;
    iamConfigAttributes.roleSets = roleSets;
    iamConfigAttributes.userSets = userSets;
    iamConfigAttributes.groupSets = groupSets;
    const iamConfig = IamConfig.fromObject(iamConfigAttributes);
    const yamlConfig = yaml.dump(iamConfig, { noRefs: true });
    await this.writeToSources.writeFiles([{ fileContent: yamlConfig, fileName: IamConfig.FILENAME }]);
  }

  private async addSSMWriteAccessPolicy(aseaConfig: AcceleratorConfig, policySets: PolicySetConfigType[]) {
    // Add policy for SSMWriteAccessPolicy
    if (this.globalOptions && this.globalOptions['aws-config']) {
      const policyFileName = 'ssm-write-access-policy.json';
      const policyFilePath = path.join(LZA_IAM_POLICY_CONFIG_PATH, policyFileName);

      const centralLogBucketOutput = findValuesFromOutputs({
        outputs: this.outputs,
        accountKey: this.globalOptions?.['central-log-services'].account,
        region: this.region,
        predicate: (o) => o.type === 'LogBucket',
      })?.[0];

      const policyContent = {
        Version: '2012-10-17',
        Statement: [
          {
            Action: ['kms:DescribeKey', 'kms:GenerateDataKey*', 'kms:Decrypt', 'kms:Encrypt', 'kms:ReEncrypt*'],
            Resource: centralLogBucketOutput.value.encryptionKeyArn,
            Effect: 'Allow',
          },
          {
            Action: 'kms:Decrypt',
            Resource: '*',
            Effect: 'Allow',
          },
          {
            Action: 's3:GetEncryptionConfiguration',
            Resource: centralLogBucketOutput.value.bucketArn,
            Effect: 'Allow',
          },
          {
            Action: ['s3:PutObject', 's3:PutObjectAcl'],
            Resource: `${centralLogBucketOutput.value.bucketArn}/*`,
            Effect: 'Allow',
          },
        ],
      };

      const policyDocumentAsString = JSON.stringify(policyContent, null, 2);
      await this.writeToSources.writeFiles(
        [
          {
            fileContent: policyDocumentAsString,
            fileName: policyFileName,
            filePath: LZA_IAM_POLICY_CONFIG_PATH,
          },
        ],
        this.writeFilesConfig,
      );

      const organizationalUnits = Object.entries(aseaConfig['organizational-units']);
      const deployToOus: string[] = [];
      const excludedRegions: string[] = [];
      organizationalUnits.forEach(([ouKey, ouConfig]) => {
        const config = ouConfig['aws-config'][0];
        if (!ouConfig.iam?.roles) return;
        if (!this.checkRolesForSsmLogWriteAccess(ouConfig.iam?.roles)) return;
        deployToOus.push(ouKey);
        if (!config) return;
        config['excl-regions'].forEach((r) => {
          if (!excludedRegions.includes(r)) excludedRegions.push(r);
        });
      });

      const accounts = Object.entries(aseaConfig['mandatory-account-configs']);
      accounts.push(...Object.entries(aseaConfig['workload-account-configs']));
      let deployToAccounts: string[] = [];

      accounts.forEach(([accountKey, accountConfig]) => {
        if (!accountConfig.iam?.roles) return;
        if (!this.checkRolesForSsmLogWriteAccess(accountConfig.iam?.roles)) return;
        deployToAccounts.push(accountKey);
      });

      policySets.push({
        deploymentTargets: {
          accounts: deployToAccounts,
          organizationalUnits: this.getNestedOusForDeploymentTargets(deployToOus),
          excludedAccounts: undefined,
          excludedRegions: excludedRegions,
        },
        policies: [
          {
            name: this.aseaPrefix + 'SSMWriteAccessPolicy',
            policy: policyFilePath,
          },
        ],
      });
    }
  }

  /**
   * Checks if any OU roles have ssm-log-archive-write-access enabled
   */
  private checkRolesForSsmLogWriteAccess(roles: any[]) {
    for (const role of roles) {
      if (role['ssm-log-archive-write-access']) {
        return true;
      }
    }
    return false;
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
    const ignoredOus: string[] = aseaConfig['global-options']['ignored-ous'] ?? [];
    Object.entries(aseaConfig['mandatory-account-configs']).forEach(([accountKey, accountConfig]) => {
      if (!ignoredOus.includes(accountConfig.ou) && !accountConfig.deleted) {
        accountsConfig.mandatoryAccounts.push({
          name: this.getAccountKeyforLza(aseaConfig['global-options'], accountKey),
          description: accountConfig.description,
          email: accountConfig.email.toLocaleLowerCase(),
          organizationalUnit: accountConfig.ou,
          warm: false,
        });
        accountKeys.push(this.getAccountKeyforLza(aseaConfig['global-options'], accountKey));
      }
    });

    Object.entries(aseaConfig['workload-account-configs']).forEach(([accountKey, accountConfig]) => {
      const nestedOu = accountConfig['ou-path'];
      if (!ignoredOus.includes(accountConfig.ou) && !accountConfig.deleted) {
        accountsConfig.workloadAccounts.push({
          name: accountKey,
          description: accountConfig.description,
          email: accountConfig.email.toLocaleLowerCase(),
          organizationalUnit: nestedOu ? accountConfig['ou-path'] : accountConfig.ou,
          warm: false,
        });
        accountKeys.push(accountKey);
      }
    });

    const yamlConfig = yaml.dump(accountsConfig, { noRefs: true });
    await this.writeToSources.writeFiles([{ fileContent: yamlConfig, fileName: AccountsConfig.FILENAME }]);
    return accountKeys;
  }

  /**
   * Converts ASEA customizations into LZA customizations configuration
   * @param aseaConfig
   */
  private async prepareCustomizationsConfig(aseaConfig: AcceleratorConfig) {
    let customizations: any = {};

    const cloudFormationStacks = await this.createCloudFormationStacksForALBIpForwarding(aseaConfig);
    customizations = {
      cloudFormationStacks,
    };
    const firewalls = await this.prepareFirewallConfig(aseaConfig);

    const customizationsConfig: CustomizationsConfigTypes = {
      customizations,
      firewalls,
    };

    const yamlConfig = yaml.dump(customizationsConfig, { noRefs: true });
    await this.writeToSources.writeFiles([{ fileContent: yamlConfig, fileName: CustomizationsConfig.FILENAME }]);
  }

  private async prepareFirewallConfig(aseaConfig: AcceleratorConfig) {
    let firewalls: Ec2FirewallConfig | undefined;
    const instances: Ec2FirewallInstanceConfig[] = [];
    //Top Level Firewalls
    Object.entries(aseaConfig['mandatory-account-configs']).forEach(([accountKey, accountConfig]) => {
      accountKey;
      const firewallsConfig = accountConfig.deployments?.firewalls;
      const vpcsInAccount = accountConfig.vpc;
      const firewallForAccount = this.prepareFirewallInstances(firewallsConfig, vpcsInAccount);
      if (firewallForAccount.length > 0) {
        this.configCheck.addWarning(
          `Third-Party firewalls are deployed in ${accountKey}. Please refer to documentation on how to manage these resources after the upgrade.`,
        );
        instances.push(...firewallForAccount);
      }
    });
    firewalls = {
      instances: instances,
      autoscalingGroups: undefined,
      targetGroups: undefined,
      managerInstances: undefined,
    };

    return firewalls;
  }

  private getFirewallInstanceVpcAccount(vpcName: any, vpcsInAccount: any) {
    //If Firewall is in a shared subnet owned by another account, account-name needs to be passed.
    let account = undefined;
    let vpcMatch = vpcsInAccount.find((vpcInAccount: { name: any }) => vpcInAccount.name === vpcName);
    if (!vpcMatch) {
      const matchingAccountVpcConfig = this.vpcConfigs.find((vpcConfig) => vpcConfig.vpcConfig.name === vpcName);
      account = matchingAccountVpcConfig?.vpcConfig.name;
    }

    return account;
  }
  private prepareFirewallInstances(firewalls: any, vpcsInAccount: any) {
    const instances: Ec2FirewallInstanceConfig[] = [];
    if (firewalls) {
      for (const firewall of firewalls) {
        if (firewall.deploy && firewall.type === 'EC2') {
          const vpcName = firewall.vpc;
          const name = firewall.name;
          const firewallScopedVpcConfig = this.vpcConfigs
            // Find VPC by name
            .find(({ vpcConfig }) => vpcConfig.name === vpcName);
          const azs = this.getListOfFirewallAzs(firewall, firewallScopedVpcConfig?.vpcConfig);
          const account = this.getFirewallInstanceVpcAccount(firewall.vpc, vpcsInAccount);
          const detailedMonitoring = false;
          const ports = firewall.ports;
          const licenseFile = firewall?.license ? firewall?.license[0] : undefined;
          const terminationProtection = true;
          const tags = undefined;
          const configFile = firewall.config;

          for (const az of azs) {
            const instanceNameWithAz = `${name}_az${az.toUpperCase()}`;
            const launchTemplate = this.prepareLaunchTemplate(firewall, ports, vpcName, az);
            const instance: Ec2FirewallInstanceConfig = {
              name: instanceNameWithAz,
              account,
              launchTemplate,
              vpc: `${vpcName}_vpc`,
              terminationProtection,
              detailedMonitoring,
              tags,
              licenseFile,
              configFile,
            };
            instances.push(instance);
          }
        }
      }
    }
    return instances;
  }

  private getListOfFirewallAzs(firewallConfig: any, vpcConfig: any) {
    const subnetName = firewallConfig.ports[0].subnet;
    const firewallSubnet = vpcConfig.subnets.filter((subnets: { name: any }) => subnets.name === subnetName);
    const firewallSubnetDefinitions = firewallSubnet[0].definitions;
    const listOfAzs = [];
    for (const firewallSubnetDefinition of firewallSubnetDefinitions) {
      listOfAzs.push(firewallSubnetDefinition.az);
    }
    return listOfAzs;
  }

  private prepareLaunchTemplate(firewall: any, ports: any[], vpcName: any, az: string) {
    const imageId = firewall['image-id'];
    const name = `${firewall.name}-LT`;
    // Leaving in case we need to switch to the -ip appended for instance profiles.
    //const iamInstanceProfile = `${firewall['fw-instance-role']}-ip`;
    const iamInstanceProfile = `${firewall['fw-instance-role']}`;
    const blockDeviceMappingsInput = firewall['block-device-mappings'];
    const instanceType = firewall['instance-sizes'];
    const securityGroups = [`${firewall['security-group']}_sg`] ?? [];
    const userData = firewall.userData;
    const blockDeviceMappings = this.prepareFirewallBlockDeviceMappings(blockDeviceMappingsInput);
    const networkInterfaces = this.prepareFirewallNetworkInterfaces(ports, securityGroups, vpcName, az);
    const enforceImdsv2 = false;
    const keyPair = firewall.keyName;

    const launchTemplate: LaunchTemplateConfig = {
      imageId,
      name,
      iamInstanceProfile,
      blockDeviceMappings,
      instanceType,
      securityGroups,
      keyPair,
      enforceImdsv2,
      networkInterfaces,
      userData,
    };
    return launchTemplate;
  }

  private prepareFirewallNetworkInterfaces(ports: any[], securityGroups: any[], vpcName: any, az: string) {
    const listOfFirewallNetworkInterfaces: NetworkInterfaceItemConfig[] = [];
    let index = 0;
    //ASEA iterates through ports in order and creates ENI Indexes starting from 0.
    for (const port of ports) {
      const networkInterfaceItem: NetworkInterfaceItemConfig = {
        associateCarrierIpAddress: undefined,
        associateElasticIp: undefined,
        associatePublicIpAddress: undefined,
        deleteOnTermination: undefined,
        description: port.name,
        deviceIndex: index,
        groups: securityGroups,
        interfaceType: undefined,
        networkCardIndex: undefined,
        networkInterfaceId: undefined,
        privateIpAddress: undefined,
        secondaryPrivateIpAddressCount: undefined,
        sourceDestCheck: false,
        subnetId: `${port.subnet}_${vpcName}_az${az}_net`,
        privateIpAddresses: undefined,
      };
      listOfFirewallNetworkInterfaces.push(networkInterfaceItem);
      index++;
    }

    return listOfFirewallNetworkInterfaces;
  }

  private prepareFirewallBlockDeviceMappings(blockDeviceMappingsInput: string[]) {
    const listOfBlockDeviceMappings: BlockDeviceMappingItem[] = [];
    for (const blockDeviceMapping of blockDeviceMappingsInput) {
      listOfBlockDeviceMappings.push({
        deviceName: blockDeviceMapping,
        ebs: {
          encrypted: true,
          volumeSize: undefined,
          deleteOnTermination: undefined,
          iops: undefined,
          kmsKeyId: undefined,
          snapshotId: undefined,
          throughput: undefined,
          volumeType: undefined,
        },
      });
    }
    return listOfBlockDeviceMappings;
  }

  /**
   * Creates map of accounts with Nested OUs
   * @param aseaConfig
   */
  private preparedNestedOuConfig = (aseaConfig: AcceleratorConfig) => {
    const accountsConfig: AccountsConfigType = {
      mandatoryAccounts: [],
      accountIds: [],
      workloadAccounts: [],
    };
    const nestedOus: ConvertConfigTypes.NestedOuType[] = [];
    Object.entries(aseaConfig['workload-account-configs']).forEach(([accountKey, accountConfig]) => {
      if (accountConfig['ou-path']) {
        accountsConfig.workloadAccounts.push({
          name: accountKey,
          description: accountConfig.description,
          email: accountConfig.email.toLocaleLowerCase(),
          organizationalUnit: accountConfig.ou,
          warm: false,
        });
        nestedOus.push({ account: accountKey, nestedOu: accountConfig['ou-path'] });
        this.setOuToNestedOuMap(accountConfig);
      }
    });

    return nestedOus;
  };

  private setOuToNestedOuMap(accountConfig: { [x: string]: any; ou: string }) {
    const currentNestedOusInMap = this.ouToNestedOuMap.get(accountConfig.ou);
      if (currentNestedOusInMap && !accountConfig['ou-path'].includes('/')) {
        //This actually takes the OU name but doesn't contain the higher level OU
        this.ouToNestedOuMap.set(accountConfig['ou-path'].split('/')[0], new Set([...currentNestedOusInMap, ...accountConfig['ou-path']]));
      } else {
        this.ouToNestedOuMap.set(accountConfig['ou-path'].split('/')[0], new Set([accountConfig['ou-path']]));
      }
    }

  /**
   * Retrieves Nested OUs
   * @param aseaConfig
   */
  private prepareNestedOus(aseaConfig: AcceleratorConfig) {
    const nestedOuConfig = this.preparedNestedOuConfig(aseaConfig);
    const nestedOuMap = nestedOuConfig.flatMap((item) => item.nestedOu);
    let nestedOus: string[] = [];
    for (const ouItem of nestedOuMap ?? []) {
      if (!nestedOus.includes(ouItem) && ouItem.includes('/')) {
        nestedOus.push(ouItem);
      }
    }
    return nestedOus;
  }

  /**
   * Retrieves List of Ignored OUs in ASEA config
   * @param aseaConfig
   */
  private prepareIgnoredOus(aseaConfig: AcceleratorConfig): string[] | undefined {
    const ignoredOus: string[] = [];
    const globalIgnoredOus: string[] = aseaConfig['global-options']['ignored-ous'] ?? [];
    Object.entries(aseaConfig['organizational-units']).forEach(([ouKey, organizationConfig]) => {
      if (organizationConfig.type === 'ignored' || globalIgnoredOus.includes(ouKey)) {
        ignoredOus.push(ouKey);
      }
    });
    return ignoredOus;
  }

  /**
   * Converts ASEA organization units and scps into LZA organizational configuration
   * @param aseaConfig
   */
  private async prepareOrganizationConfig(aseaConfig: AcceleratorConfig) {
    const ignoredOus = this.prepareIgnoredOus(aseaConfig);
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
    if (ignoredOus) {
      ignoredOus.forEach((ou) => {
        organizationConfig.organizationalUnits.push({
          name: ou,
          ignore: true,
        });
      });
    }
    Object.entries(aseaConfig['organizational-units']).forEach(([ouKey]) => {
      const ignoredOu = ignoredOus?.includes(ouKey);
      organizationConfig.organizationalUnits.push({
        name: ouKey,
        ignore: ignoredOu ? true : undefined,
      });
    });
    // ASEA Creates Suspended OU and ignores accounts under Suspended OU
    if (!organizationConfig.organizationalUnits.find((ou) => ou.name === 'Suspended')) {
      organizationConfig.organizationalUnits.push({
        name: 'Suspended',
        ignore: true,
      });
    }
    // Check and prepare for nested OUs
    const nestedOus = this.prepareNestedOus(aseaConfig);
    //Get List of OU names from OU object
    const listOfOus = organizationConfig.organizationalUnits.map(ou => ou.name);
    // Check for Nested OU in existing list before pushing on, also checking for / to ensure nested OU
    nestedOus.forEach((ouItem) => {
      if (!listOfOus.includes(ouItem)) {
        organizationConfig.organizationalUnits.push({
          name: ouItem,
          ignore: undefined,
        });
      }
    });

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
      const scpName = createScpName(this.aseaPrefix, scp.name);
      // Read SCP content from Organizations to avoid replacing replacements
      let policyData = await this.organizations.getScpContent(scpName);
      if (!policyData) {
        // If SCP is not found in organizations fallback to S3
        policyData = await this.s3.getObjectBodyAsString({
          Bucket: this.centralBucketName,
          Key: path.join(SCP_CONFIG_PATH, scp.policy),
        });
        Object.entries(replacements).map(([key, value]) => {
          policyData = policyData?.replace(new RegExp(key, 'g'), value);
        });
      }
      const policyJson = JSON.parse(policyData);
      if (scpName.includes('Guardrails-Part-1') || scpName.includes('Guardrails-Part-0')) {
        const newStatements = policyJson.Statement.map((stmt: any) => {
          if (stmt.Sid === 'SSM' || stmt.Sid === 'S3' || (stmt.Condition && stmt.Condition['ForAnyValue:StringLike'])) {
            console.log('Adding Org admin role to scp');
            const arnExists = stmt.Condition.ArnNotLike['aws:PrincipalARN'].find(
              (arn: string) => arn === `arn:aws:iam::*:role/${aseaConfig['global-options']['organization-admin-role']}`,
            );
            if (!arnExists) {
              stmt.Condition.ArnNotLike['aws:PrincipalARN'].push(
                `arn:aws:iam::*:role/${aseaConfig['global-options']['organization-admin-role']}`,
              );
            }
          }
          return stmt;
        });

        policyJson.Statement = newStatements;
      }
      await this.writeToSources.writeFiles([
        {
          fileContent: JSON.stringify(policyJson, null, 2),
          fileName: scp.policy,
          filePath: LZA_SCP_CONFIG_PATH,
        },
      ]);
      organizationConfig.serviceControlPolicies.push({
        name: scpName,
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
      const quarantineScpContent = {
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
      };
      const quarantineScpName = createScpName(this.aseaPrefix, 'Quarantine-New-Object');
      const scpContent = await this.organizations.getScpContent(quarantineScpName);
      await this.writeToSources.writeFiles([
        {
          fileContent: JSON.stringify(scpContent ?? quarantineScpContent),
          fileName: `${quarantineScpName}.json`,
          filePath: LZA_SCP_CONFIG_PATH,
        },
      ]);
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
    await this.writeToSources.writeFiles([{ fileContent: yamlConfig, fileName: OrganizationConfig.FILENAME }]);
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
          exportFrequency: centralSecurityConfig['guardduty-frequency'] ?? 'FIFTEEN_MINUTES',
          overrideGuardDutyPrefix: {
            useCustomPrefix: true,
          },
        },
      };
    };

    const setMacieConfig = async () => {
      securityConfigAttributes.centralSecurityServices.macie = {
        enable: centralSecurityConfig.macie || false,
        excludeRegions: centralSecurityConfig['macie-excl-regions'],
        policyFindingsPublishingFrequency: centralSecurityConfig['macie-frequency'],
        publishSensitiveDataFindings: centralSecurityConfig['macie-sensitive-sh'],
      };
    };

    const setSecurityhubConfig = async () => {
      const nullNotificationLevel = centralSecurityConfig['security-hub-findings-sns'] === 'None';
      securityConfigAttributes.centralSecurityServices.securityHub = {
        enable: centralSecurityConfig['security-hub'],
        regionAggregation: true,
        snsTopicName: nullNotificationLevel
          ? undefined
          : `${this.aseaPrefix}Notification-${SnsFindingTypesDict[centralSecurityConfig['security-hub-findings-sns']]}`,
        excludeRegions: centralSecurityConfig['security-hub-excl-regions'],
        notificationLevel: nullNotificationLevel
          ? undefined
          : centralSecurityConfig['security-hub-findings-sns'].toUpperCase(),
        standards: globalOptions['security-hub-frameworks'].standards.map((sh) => ({
          name: sh.name,
          enable: true,
          controlsToDisable: sh['controls-to-disable'],
        })),
        logging: {
          cloudWatch: {
            enable: true,
            logGroupName: '/ASEA/SecurityHub',
          },
        },
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
        await this.writeToSources.writeFiles([
          {
            fileContent: isYaml ? yaml.dump(content, { noRefs: true }) : JSON.stringify(content),
            fileName: document.template,
            filePath: SSM_DOCUMENTS_CONFIG_PATH,
          },
        ]);
        const documentSet: DocumentSet = {
          // Adding one document into documentSet to make shareTargets computation easy
          documents: [
            {
              name: createSsmDocumentName(this.aseaPrefix, document.name),
              template: path.join(SSM_DOCUMENTS_CONFIG_PATH, document.template),
            },
          ],
          shareTargets: ssmDocumentSharedTo(document.name),
        };
        this.documentSets.push(documentSet);
      }
      securityConfigAttributes.centralSecurityServices.ssmAutomation = {
        excludeRegions,
        documentSets: this.documentSets,
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
        excludeRegions: this.regionsWithoutVpc,
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
              this.getAccountKeyforLza(globalOptions, centralSecurityConfig.account)) ||
            (globalOptions['aws-org-management']['config-aggr'] &&
              this.getAccountKeyforLza(globalOptions, globalOptions['aws-org-management'].account)) ||
            (globalOptions['central-operations-services']['config-aggr'] &&
              this.getAccountKeyforLza(globalOptions, globalOptions['aws-org-management'].account)) ||
            (globalOptions['central-log-services']['config-aggr'] &&
              this.getAccountKeyforLza(globalOptions, globalOptions['aws-org-management'].account)) ||
            this.getAccountKeyforLza(globalOptions, centralSecurityConfig.account),
        };
      }
    };

    const setConfigRulesConfig = async () => {
      if (!globalOptions['aws-config']) return;
      // TODO: Consider account regions for deploymentTargets
      const currentNodeRuntime = 'nodejs18.x';
      const rulesWithTarget: (AwsConfigRule & {
        deployTo?: string[];
        excludedAccounts?: string[];
        excludedRegions?: string[];
      })[] = [];
      for (const configRule of globalOptions['aws-config'].rules) {
        const deployToOus: string[] = [];
        const excludedAccounts: string[] = [];
        const excludedRegions = new Set<string>();
        let excludeRemediateRegions: string[] = [];
        organizationalUnits.forEach(([ouKey, ouConfig]) => {
          const matchedConfig = ouConfig['aws-config'].find((c) => c.rules.includes(configRule.name));
          if (!matchedConfig) return;
          deployToOus.push(ouKey);
          matchedConfig['excl-regions'].forEach((r) => excludedRegions.add(r));
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
        const rulePolicyDocument = '{}';
        let customRuleProps;
        if (configRule.type === 'custom') {
          const lzaFileName = configRule['runtime-path'] ?? defaultSourcePath;
          const aseaFilePath = path.join(CONFIG_RULES_PATH, configRule['runtime-path'] ?? defaultSourcePath);
          const configSource = await this.s3.getObjectBodyV3({
            Bucket: this.centralBucketName,
            Key: aseaFilePath,
          });
          const configSourceFormatted = await configSource.transformToByteArray();

          await this.writeToSources.writeFiles(
            [
              {
                fileContent: configSourceFormatted,
                fileName: lzaFileName,
                filePath: LZA_CONFIG_RULES,
              },
            ],
            this.writeFilesConfig,
          );

          const detectionPolicyName = `detection-${configRule.name.toLocaleLowerCase()}.json`;
          const detectionPolicyPath = path.join(LZA_CONFIG_RULES, detectionPolicyName);

          if (!ConfigRuleDetectionAssets[configRule.name]) {
            await this.writeToSources.writeFiles(
              [
                {
                  fileContent: rulePolicyDocument,
                  fileName: detectionPolicyName,
                  filePath: LZA_CONFIG_RULES,
                },
              ],
              this.writeFilesConfig,
            );
            this.configCheck.addWarning(
              `Custom AWS Config Rule with detection needs an IAM policy written Rule Name: "${configRule.name}".  Policy file name: "${detectionPolicyPath}`,
            );
          }
          let nodeRuntime = configRule.runtime ?? currentNodeRuntime;
          if (['nodejs16.x', 'nodejs14.x'].includes(configRule.runtime!)) {
            this.configCheck.addWarning(
              `Custom AWS Config Rule "${configRule.name}" with NodeJS runtime: "${configRule.runtime}" is deprecated. The runtime for this config rule is updated to nodejs18.x. It may not work as expected.`,
            );
            nodeRuntime = currentNodeRuntime;
          }
          customRuleProps = {
            lambda: {
              handler: 'index.handler',
              rolePolicyFile: ConfigRuleDetectionAssets[configRule.name] ?? detectionPolicyPath,
              runtime: nodeRuntime,
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

        const remediationPolicyName = `remediation-${configRule.name.toLocaleLowerCase()}.json`;
        const remediationPolicyPath = path.join(LZA_CONFIG_RULES, remediationPolicyName);

        if (!ConfigRuleRemediationAssets[configRule['remediation-action']!] && configRule.type === 'custom') {
          await this.writeToSources.writeFiles(
            [
              {
                fileContent: rulePolicyDocument,
                fileName: remediationPolicyName,
                filePath: LZA_CONFIG_RULES,
              },
            ],
            this.writeFilesConfig,
          );
          this.configCheck.addWarning(
            `Custom AWS Config Rule with remediation needs an IAM policy written Rule Name: "${configRule.name}".  Policy file name: "${remediationPolicyPath}`,
          );
        }

        const rule: AwsConfigRule & { deployTo?: string[]; excludedAccounts?: string[]; excludedRegions?: string[] } = {
          name: createConfigRuleName(this.aseaPrefix, configRule.name),
          description: undefined,
          identifier: configRule.type === 'managed' ? configRule.name : undefined,
          type: configRule.type === 'custom' ? 'Custom' : undefined,
          inputParameters: this.replaceAccelLookupValues(configRule.parameters),
          tags: undefined,
          complianceResourceTypes: configRule.type === 'managed' ? configRule['resource-types'] : undefined,
          remediation: configRule.remediation
            ? {
                targetId: createSsmDocumentName(this.aseaPrefix, configRule['remediation-action']!),
                parameters: this.replaceAccelLookupValuesForRedemption(configRule['remediation-params']),
                maximumAutomaticAttempts: configRule['remediation-attempts'] ?? 5,
                retryAttemptSeconds: configRule['remediation-retry-seconds'] ?? 60,
                automatic: true,
                rolePolicyFile: ConfigRuleRemediationAssets[configRule['remediation-action']!] ?? remediationPolicyPath,
                targetAccountName: undefined,
                targetDocumentLambda: undefined,
                targetVersion: undefined,
                excludeRegions: excludeRemediateRegions as Region[],
              }
            : undefined,
          deployTo: deployToOus,
          customRule: customRuleProps,
          excludedAccounts,
          excludedRegions: Array.from(excludedRegions),
        };

        rulesWithTarget.push(rule);
      }
      //validation to ensure rules with remediation via ssm have document to deployed to matching ou's
      for (const rule of rulesWithTarget) {
        if (rule.remediation && rule.remediation.targetId) {
          for (const documentSet of this.documentSets) {
            for (const document of documentSet.documents) {
              if (document.name === rule.remediation.targetId) {
                for (const target of documentSet.shareTargets.organizationalUnits ?? []) {
                  if (!rule.deployTo?.includes(target)) {
                    this.configCheck.addWarning(
                      `SSM Remediation document ${document.name} is not deployed to the same OU ${target} as the config rule ${rule.name}.`,
                    );
                  }
                }
                for (const target of documentSet.shareTargets.accounts ?? []) {
                  if (!rule.deployTo?.includes(target)) {
                    this.configCheck.addWarning(
                      `SSM Remediation document ${document.name} is not deployed to the same account ${target} as the config rule ${rule.name}.`,
                    );
                  }
                }
              }
            }
          }
        }
      }
      const consolidatedRules = _.groupBy(rulesWithTarget, function (item) {
        return `${item.deployTo?.join(',')}$${item.excludedAccounts?.join(',')}$${item.excludedRegions?.join(',')}`;
      });
      Object.entries(consolidatedRules).forEach(([_groupKey, values]) => {
        let ou;
        if (values[0].deployTo) {
          ou = this.getNestedOusForDeploymentTargets(values[0].deployTo);
        }
        const deploymentTargets = {
          organizationalUnits: ou ?? values[0].deployTo,
          excludedRegions: values[0].excludedRegions,
          excludedAccounts: values[0].excludedAccounts,
        };

        // Remove deployTo, excludedRegions and excludedAccounts from rules
        let onlyRules: Partial<typeof values> = [];
        for (const ruleItem of values) {
          onlyRules.push({
            name: ruleItem.name,
            type: ruleItem.type,
            identifier: ruleItem.identifier,
            description: ruleItem.description,
            complianceResourceTypes: ruleItem.complianceResourceTypes,
            inputParameters: ruleItem.inputParameters,
            customRule: ruleItem.customRule,
            remediation: ruleItem.remediation,
            tags: ruleItem.tags,
          });
        }

        securityConfigAttributes.awsConfig.ruleSets.push({
          deploymentTargets,
          rules: onlyRules,
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
    await this.writeToSources.writeFiles([{ fileContent: yamlConfig, fileName: SecurityConfig.FILENAME }]);
  }

  async prepareNetworkConfig(aseaConfig: AcceleratorConfig) {
    const accountsConfig = aseaConfig.getAccountConfigs();
    const globalOptions = aseaConfig['global-options'];
    const organizationalUnitsConfig = aseaConfig.getOrganizationConfigs();
    // Creating default policy for vpc endpoints
    await this.writeToSources.writeFiles([
      {
        fileContent: JSON.stringify({
          Statement: [
            {
              Effect: 'Allow',
              Principal: '*',
              Action: 'ec2:*',
              Resource: '*',
            },
          ],
        }),
        fileName: 'default.json',
        filePath: 'vpc-endpoint-policies',
      },
    ]);
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
      };
      const certificates: CertificateType[] = [];
      const processedCertificates = new Set<string>();
      const getTransformedCertificate = async (certificate: CertificateConfig) => {
        const ousWithOutNestedOus = organizationalUnitsConfig
        .filter(([_ouKey, ouConfig]) => !!ouConfig.certificates?.find((c) => c.name === certificate.name))
        .map(([ouKey]) => ouKey);

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
            organizationalUnits: this.getNestedOusForDeploymentTargets(ousWithOutNestedOus),
            excludedRegions: this.globalOptions?.['supported-regions'].filter((region) => region !== this.region) ?? [],
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
      for (const [accountKey, accountConfig] of accountsConfig) {
        if (!accountConfig.certificates) continue;
        for (const certificate of accountConfig.certificates) {
          const certificateOutput = findValuesFromOutputs({
            outputs: this.outputs,
            accountKey,
            region: this.region,
            predicate: (o) => o.type === 'Acm' && o.value.certificateName === certificate.name,
          })?.[0];
          await this.putParameter(
            `/${this.aseaPrefix.slice(0, -1)}/acm/${certificate.name}/arn`,
            certificateOutput.value.certificateArn,
            accountKey,
          );
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
            await this.putParameter(
              `/${this.aseaPrefix.slice(0, -1)}/acm/${certificate.name}/arn`,
              certificateOutput.value.certificateArn,
              accountKey,
            );
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
        routeTableName: string,
      ) => {
        const lzaRoutes: any[] = [];
        // process routes explicitly defined in ASEA config
        routes.forEach((route) => {
          lzaRoutes.push({
            destinationCidrBlock: route.destination,
            blackhole: route['blackhole-route'],
            attachment: getTransitGatewayRouteAttachment(route, accountKey, tgwConfig),
          });
        });
        // add blackhole routes added implicitly by ASEA
        const attachVpcConfig = this.vpcConfigs.filter(
          ({ vpcConfig }) =>
            vpcConfig['tgw-attach'] &&
            vpcConfig['tgw-attach']['associate-to-tgw'] === tgwConfig.name &&
            vpcConfig['tgw-attach']['blackhole-route'] === true &&
            vpcConfig['tgw-attach']['tgw-rt-associate'][0] === routeTableName &&
            vpcConfig['tgw-attach']['associate-type'] === 'ATTACH',
        );
        attachVpcConfig.forEach((vpc) => {
          const vpcCidrs = this.getVpcCidr({ accountKey, vpcConfig: vpc.vpcConfig });
          vpcCidrs.forEach((cidr) => {
            lzaRoutes.push({
              destinationCidrBlock: cidr,
              blackhole: vpc.vpcConfig['tgw-attach']?.['blackhole-route'],
            });
          });
        });
        return lzaRoutes;
      };

      const prepareTransitGatewayShareTargets = (accountKey: string, tgwConfig: TgwDeploymentConfig) => {
        const attachVpcConfig = this.vpcConfigs.filter(
          ({ vpcConfig }) =>
            vpcConfig['tgw-attach'] &&
            vpcConfig['tgw-attach'].account === accountKey &&
            vpcConfig['tgw-attach']['associate-to-tgw'] === tgwConfig.name &&
            vpcConfig['tgw-attach']['associate-type'] === 'ATTACH',
        );

        const shareTargets: ShareTargets = {
          organizationalUnits: [],
          accounts: [],
        };
        attachVpcConfig.forEach(({ ouKey, accountKey: vpcAccountKey }) => {
          if (vpcAccountKey && accountKey !== vpcAccountKey) {
            shareTargets.accounts.push(this.getAccountKeyforLza(this.globalOptions!, vpcAccountKey));
          }
          if (!vpcAccountKey) shareTargets.organizationalUnits.push(ouKey);
        });
        return shareTargets;
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
                routeTableName,
              ),
            })),
            shareTargets: prepareTransitGatewayShareTargets(accountKey, tgwConfig),
          });
          if (tgwConfig['tgw-attach']) {
            const tgwPeeringConfig = tgwConfig['tgw-attach'];
            transitGatewayPeering.push({
              name: transitGatewayPeerName(tgwConfig.name, tgwPeeringConfig['associate-to-tgw']),
              requester: {
                transitGatewayName: transitGatewayName(tgwConfig.name),
                account: lzaAccountKey,
                region: tgwConfig.region,
                routeTableAssociations: transitGatewayRouteTableName(
                  tgwPeeringConfig['tgw-rt-associate-local'][0],
                  tgwConfig.name,
                ),
              },
              accepter: {
                transitGatewayName: transitGatewayName(tgwPeeringConfig['associate-to-tgw']),
                account: this.getAccountKeyforLza(globalOptions, tgwPeeringConfig.account),
                region: tgwPeeringConfig.region,
                routeTableAssociations: transitGatewayRouteTableName(
                  tgwPeeringConfig['tgw-rt-associate-remote'][0],
                  tgwPeeringConfig['associate-to-tgw'],
                ),
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

      const prepareAlb = (vpcConfig: VpcConfig, accountKey?: string) => {
        enum Scheme {
          'internet-facing',
          'internal',
        }
        enum ActionType {
          'forward',
          'redirect',
          'fixed-response',
        }
        enum SslPolicy {
          'ELBSecurityPolicy-TLS-1-0-2015-04',
          'ELBSecurityPolicy-TLS-1-1-2017-01',
          'ELBSecurityPolicy-TLS-1-2-2017-01',
          'ELBSecurityPolicy-TLS-1-2-Ext-2018-06',
          'ELBSecurityPolicy-FS-2018-06',
          'ELBSecurityPolicy-FS-1-1-2019-08',
          'ELBSecurityPolicy-FS-1-2-2019-08',
          'ELBSecurityPolicy-FS-1-2-Res-2019-08',
          'ELBSecurityPolicy-2015-05',
          'ELBSecurityPolicy-FS-1-2-Res-2020-10',
          'ELBSecurityPolicy-2016-08',
        }
        const lzaAlbs: { applicationLoadBalancers: ApplicationLoadBalancerConfig[] } = { applicationLoadBalancers: [] };
        const albs = this.albs.filter((lb) => lb.vpc === vpcConfig.name);
        if (albs.length === 0) return undefined;
        for (const alb of albs) {
          this.configCheck.addWarning(
            `Application Load Balancer ${alb.name} is deployed to ${accountKey}. Please refer to documentation on how to manage this resource after the upgrade.`,
          );
          const albSubnets = this.getAzSubnets(vpcConfig, alb.subnets);
          const albConfig: ApplicationLoadBalancerConfig = {
            name: createAlbName(alb.name, accountKey!),
            scheme: alb.scheme as keyof typeof Scheme,
            subnets: albSubnets.map((s) => createSubnetName(alb.vpc, s.subnetName, s.az)),
            securityGroups: [`${alb['security-group']}_sg`],
            attributes: {
              deletionProtection: true,
              idleTimeout: 60,
              routingHttpDesyncMitigationMode: 'defensive',
              routingHttpDropInvalidHeader: false,
              routingHttpXAmznTlsCipherEnable: false,
              routingHttpXffClientPort: false,
              routingHttpXffHeaderProcessingMode: 'append',
              http2Enabled: true,
              wafFailOpen: false,
            },
            listeners: [
              {
                name: `${alb.name}-listener`,
                port: alb.ports,
                protocol: 'HTTPS',
                type: alb['action-type'] as keyof typeof ActionType,
                certificate: undefined,
                sslPolicy: alb['security-policy'] as keyof typeof SslPolicy,
                fixedResponseConfig: undefined,
                targetGroup: `${alb.name}-${alb.targets[0]['target-name']}`.substring(0, 31),
                //targetGroup: `${alb.name}-health-check-Lambda`,
                //forwardConfig: { targetGroupStickinessConfig: { durationSeconds: 3600, enabled: true } },
                forwardConfig: undefined,
                redirectConfig: undefined,
                order: undefined,
              },
            ],
          };
          lzaAlbs.applicationLoadBalancers.push(albConfig);
        }
        if (lzaAlbs.applicationLoadBalancers.length === 0) return undefined;
        return lzaAlbs;
      };

      const prepareTargetGroup = (vpcConfig: VpcConfig) => {
        enum Protocol {
          'HTTP',
          'HTTPS',
          'TCP',
          'TLS',
          'UDP',
          'TCP_UDP',
          'GENEVE',
        }
        enum HealthCheckProtocol {
          'HTTP',
          'HTTPS',
          'TCP',
        }
        enum TargetType {
          'instance',
          'ip',
          'lambda',
          'alb',
        }
        const targetGroups: TargetGroupItemConfig[] = [];
        const albs = this.albs.filter((lb) => lb.vpc === vpcConfig.name);
        if (albs.length === 0) return;
        for (const alb of albs) {
          for (const target of alb.targets) {
            const targetConfig: TargetGroupItemConfig = {
              name: `${alb.name}-${target['target-name']}`.substring(0, 31),
              port: target.port ?? 443,
              protocol: (target.protocol as keyof typeof Protocol) ?? 'HTTPS',
              protocolVersion: undefined,
              type: target['target-type'] as keyof typeof TargetType,
              healthCheck: {
                interval: 10,
                path: target['health-check-path'],
                port: target['health-check-port'],
                protocol: target['health-check-protocol'] as keyof typeof HealthCheckProtocol,
                timeout: undefined,
              },
              attributes: undefined,
              targets: undefined,
              matcher: undefined,
              threshold: undefined,
            };
            targetGroups.push(targetConfig);
          }
        }
        if (targetGroups.length === 0) return undefined;
        return targetGroups;
      };

      const prepareSecurityGroupRules = (rules: SecurityGroupRuleConfig[], accountKey?: string) => {
        const lzaRules: ConvertConfigTypes.SecurityGroupRuleType[] = [];
        for (const rule of rules) {
          const lzaRule: ConvertConfigTypes.SecurityGroupRuleType = {
            description: rule.description,
            types: rule.type,
            tcpPorts: rule['tcp-ports'],
            udpPorts: rule['udp-ports'],
            fromPort: rule.fromPort,
            toPort: rule.toPort,
            sources: [],
          };
          for (const source of rule.source) {
            let sourceVpcAccountKey: string | undefined = undefined;
            if (SubnetSourceConfig.is(source)) {
              sourceVpcAccountKey = this.vpcConfigs.find(({ vpcConfig }) => vpcConfig.name === source.vpc)?.accountKey;
            }
            if (SecurityGroupSourceConfig.is(source)) {
              lzaRule.sources.push({
                securityGroups: source['security-group'].map(securityGroupName),
              });
            } else if (SubnetSourceConfig.is(source)) {
              lzaRule.sources.push({
                //account: this.getAccountKeyforLza(globalOptions, source.account || accountKey || ''),
                account: this.getAccountKeyforLza(globalOptions, sourceVpcAccountKey || source.account || accountKey || ''),
                subnets: source.subnet.flatMap((sourceSubnet) =>
                  aseaConfig
                    .getAzSubnets(sourceVpcAccountKey || source.account || accountKey || '', source.vpc, sourceSubnet)
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
      const prepareNaclRules = (
        rules: NaclConfig[],
        vpcConfig: VpcConfig,
        accountKey?: string,
        lzaVpcName?: string,
      ) => {
        const lzaRules: (ConvertConfigTypes.LzaNaclInboundRuleType | ConvertConfigTypes.LzaNaclOutboundRuleType)[] = [];
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
                let targetRegion = undefined;
                let target;
                if (destinationVpcConfig.region !== vpcConfig.region) {
                  targetRegion = destinationVpcConfig.region;
                }
                if (!accountKey && destinationVpcConfig.name === vpcConfig.name) {
                  //If NACL is defined in a vpcTemplate, and rule is referencing the same VPC
                  // Then make NACL target explicit by looking up the static subnet CIDR
                  target = this.getSubnetCidr({
                    accountKey,
                    cidrSrc: vpcConfig['cidr-src'],
                    region: vpcConfig.region,
                    subnetDefinition: ruleSubnet,
                    subnetName: ruleSubnet.subnetName,
                    vpcName: vpcConfig.name,
                  });
                } else {
                  // determine which vpc the nacl rule references
                  // use the lzaVpcName when the config is from ou
                  let destination: string;
                  if (dest.vpc === vpcConfig.name) {
                    destination = createVpcName(lzaVpcName ?? vpcConfig.name);
                  } else {
                    destination = createVpcName(dest.vpc);
                  }
                  target = {
                    account: destinationVpcKey ? this.getAccountKeyforLza(globalOptions, destinationVpcKey) : undefined,
                    subnet: createSubnetName(dest.vpc, ruleSubnet.subnetName, ruleSubnet.az),
                    //vpc: createVpcName(dest.vpc),
                    vpc: destination,
                    region: targetRegion,
                  };
                }
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
      const prepareNaclConfig = (vpcConfig: VpcConfig, accountKey?: string, lzaVpcName?: string) => {
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
            inboundRules: prepareNaclRules(inboundRules, vpcConfig, accountKey, lzaVpcName),
            outboundRules: prepareNaclRules(outboundRules, vpcConfig, accountKey, lzaVpcName),
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
        if (destinationType === 'NONE') {
          return;
        } else if (destinationType === 'S3' || 'BOTH') {
          const vpcFlowLogsS3BucketConfig = {
            overrideS3LogPath: '${ACCEL_LOOKUP::ACCOUNT_ID}/${ACCEL_LOOKUP::VPC_NAME}',
          };

          const destinationsConfig: VpcFlowLogsDestinationConfig = {
            s3: vpcFlowLogsS3BucketConfig,
            cloudWatchLogs: undefined,
          };

          return {
            trafficType: defaultVpcFlowLogsConfig.filter,
            maxAggregationInterval: defaultVpcFlowLogsConfig.interval,
            destinations: destinationTypes[destinationType],
            destinationsConfig: destinationsConfig,
            defaultFormat: defaultVpcFlowLogsConfig['default-format'],
            customFields: defaultVpcFlowLogsConfig['custom-fields'],
          };
        }
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
        const lzaSubnets: ConvertConfigTypes.SubnetType[] = [];
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

      const prepareEndpointsConfig = (
        vpcConfig: VpcConfig,
        lzaEndpointsConfig: ConvertConfigTypes.ResolverEndpointsType[],
        lzaEndpointsRulesConfig: ConvertConfigTypes.ResolverEndpointRulesType[],
      ): ConvertConfigTypes.ResolverEndpointsType[] => {
        let inboundResolver = vpcConfig.resolvers!.inbound;
        let outboundResolver = vpcConfig.resolvers!.outbound;
        if (vpcConfig.resolvers) {
          if (inboundResolver) {
            lzaEndpointsConfig.push({
              name: `${vpcConfig.name}InboundEndpoint`,
              vpc: createVpcName(vpcConfig.lzaVpcName ?? vpcConfig.name),
              subnets:
                vpcConfig.subnets
                  ?.find((subnetItem) => subnetItem.name === vpcConfig.resolvers?.subnet)
                  ?.definitions.filter((subnetItem) => !subnetItem.disabled)
                  .map((subnetItem) => createSubnetName(vpcConfig.name, vpcConfig.resolvers?.subnet!, subnetItem.az)) ||
                [],
              type: 'INBOUND',
              rules: undefined,
            });
          }
          if (outboundResolver) {
            lzaEndpointsConfig.push({
              name: `${vpcConfig.name}OutboundEndpoint`,
              vpc: createVpcName(vpcConfig.lzaVpcName ?? vpcConfig.name),
              subnets:
                vpcConfig.subnets
                  ?.find((subnetItem) => subnetItem.name === vpcConfig.resolvers?.subnet)
                  ?.definitions.filter((subnetItem) => !subnetItem.disabled)
                  .map((subnetItem) => createSubnetName(vpcConfig.name, vpcConfig.resolvers?.subnet!, subnetItem.az)) ||
                [],
              type: 'OUTBOUND',
              rules: lzaEndpointsRulesConfig,
            });
          }
        }
        return lzaEndpointsConfig;
      };

      const prepareRulesConfig = (
        vpcConfig: VpcConfig,
        lzaEndpointsRulesConfig: ConvertConfigTypes.ResolverEndpointRulesType[],
      ): ConvertConfigTypes.ResolverEndpointRulesType[] | undefined => {
        if (vpcConfig['on-premise-rules']) {
          for (const vpcItem of vpcConfig['on-premise-rules']) {
            const ips: { ip: string; port?: number }[] = [];
            for (const ip of vpcItem['outbound-ips']) {
              ips.push({ ip: ip });
            }
            lzaEndpointsRulesConfig.push({
              name: `${this.aseaPrefix}outbound-rule-${vpcConfig['on-premise-rules'].indexOf(vpcItem)}`,
              ruleType: 'FORWARD',
              domainName: vpcItem.zone,
              targetIps: vpcItem['outbound-ips'].map((ip) => ({ ip })),
            });
          }
        }
        return lzaEndpointsRulesConfig;
      };

      const prepareResolverConfig = (vpcConfig: VpcConfig) => {
        let lzaResolverConfig: {
          endpoints: ConvertConfigTypes.ResolverEndpointsType[];
          queryLogs: { name: string; destinations: string[] } | undefined;
        };
        const queryLoggingEnabled = vpcConfig['dns-resolver-logging'];
        const lzaEndpointsRulesConfig: ConvertConfigTypes.ResolverEndpointRulesType[] = [];
        const lzaEndpointsConfig: ConvertConfigTypes.ResolverEndpointsType[] = [];
        if (!vpcConfig.resolvers) return;
        const rules = prepareRulesConfig(vpcConfig, lzaEndpointsRulesConfig);
        const endpoints = prepareEndpointsConfig(vpcConfig, lzaEndpointsConfig, rules!);

        lzaResolverConfig = {
          endpoints: endpoints,
          queryLogs: queryLoggingEnabled
            ? {
                name: `${this.aseaPrefix}rql-${vpcConfig.name}`,
                destinations: ['cloud-watch-logs'],
              }
            : undefined,
        };
        return lzaResolverConfig;
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

      const prepareVpcConfig = ({ accountKey, ouKey, vpcConfig, excludeAccounts, lzaVpcName }: ResolvedVpcConfig) => {
        return {
          name: createVpcName(lzaVpcName ?? vpcConfig.name),
          account: accountKey ? this.getAccountKeyforLza(globalOptions, accountKey) : undefined,
          deploymentTargets: !accountKey
            ? {
                organizationalUnits: this.getNestedOusForDeploymentTargets([ouKey]),
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
          networkAcls: prepareNaclConfig(vpcConfig, accountKey, lzaVpcName),
          vpcFlowLogs: prepareVpcFlowLogs(vpcConfig['flow-logs']),
          subnets: prepareSubnetConfig(vpcConfig, ouKey, accountKey),
          transitGatewayAttachments: prepareTgwAttachConfig(vpcConfig),
          virtualPrivateGateway: vpcConfig.vgw,
          routeTables: prepareRouteTableConfig(vpcConfig, accountKey),
          vpcRoute53Resolver: prepareResolverConfig(vpcConfig),
          loadBalancers: prepareAlb(vpcConfig, accountKey),
          targetGroups: prepareTargetGroup(vpcConfig),
        };
      };

      const lzaVpcConfigs = [];
      const lzaVpcTemplatesConfigs = [];
      for (const { accountKey, vpcConfig, ouKey, excludeAccounts, lzaVpcName } of this.vpcConfigs) {
        if (vpcConfig.deploy !== 'local' && vpcConfig.deploy !== accountKey) {
          this.configCheck.addError(
            `Invalid VPC configuration found VPC: "${vpcConfig.name}" in Account: "${accountKey}" and OU: "${ouKey}"`,
          );
          continue;
        }
        if (!!accountKey) {
          lzaVpcConfigs.push(prepareVpcConfig({ accountKey, vpcConfig, ouKey, lzaVpcName }));
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
          vpcs: [createVpcName(vpcConfig.lzaVpcName ?? vpcConfig.name), createVpcName(vpcConfig.pcx!['source-vpc'])],
        }));
    };
    await setCertificatesConfig();
    await setVpcConfig();
    await setTransitGatewaysAndPeeringConfig();
    await setVpcPeeringConfig();
    /*
      The original network-config.yaml file has subnets.routeTable and networkAcl.subnetAssociations commented out.
      This is so the end user can validate the routeTables and subnetAssociations before attaching them in a subsequent run.
    */
    const networkConfig = NetworkConfig.loadFromString(JSON.stringify(networkConfigAttributes));
    const yamlConfig = yaml.dump(networkConfig, { noRefs: true });

    // This creates network-config.yaml
    await this.writeToSources.writeFiles([
      {
        fileContent: yamlConfig,
        fileName: NetworkConfig.FILENAME,
      },
    ]);
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

      let paramType = typeof value === 'object' ? 'StringList' : 'String';
      if (key === 'LogDestination' || key === 'KMSMasterKey') {
        paramType = 'StringList';
      }
      parameters.push({
        name: key,
        value: parsedValue,
        type: paramType,
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
    value = value.replace('EC2-Default-SSM-AD-Role-ip', '${ACCEL_LOOKUP::InstanceProfile:EC2-Default-SSM-AD-Role}');
    value = value.replace(
      // DO NOT FIX THE SPELLING FOR INSTANCE. THE TYPO EXISTS IN ASEA
      '${SEA::EC2InstaceProfilePermissions}',
      '${ACCEL_LOOKUP::CustomerManagedPolicy:ASEA-SSMWriteAccessPolicy}',
    );
    return value;
  }

  private async prepareExternalIdsConfig(role: IamRoleConfig) {
    const externalIds: string[] = [];
    if (role['trust-policy']) {
      const trustPolicy = await this.s3.getObjectBodyAsString({
        Bucket: this.centralBucketName,
        Key: path.join(IAM_POLICY_CONFIG_PATH, role['trust-policy']),
      });
      const content = JSON.parse(trustPolicy);

      // Check trust policy support
      await this.configCheck.checkIamTrustsConfig(role, trustPolicy);
      if (content.Statement.length >= 1) {
        for (const externalIdItem of content.Statement ?? []) {
          if (externalIdItem.Condition && externalIdItem.Condition.StringEquals?.['sts:ExternalId']) {
            if (!externalIds.includes(externalIdItem.Condition.StringEquals['sts:ExternalId'])) {
              externalIds.push(externalIdItem.Condition.StringEquals['sts:ExternalId']);
            }
          }
        }
      } else {
        if (content.Statement.Condition && content.Statement.Condition.StringEquals?.['sts:ExternalId']) {
          if (!externalIds.includes(content.Statement.Condition.StringEquals?.['sts:ExternalId'])) {
            externalIds.push(content.Statement.Condition.StringEquals?.['sts:ExternalId']);
          }
        }
      }
      return externalIds;
    } else {
      return undefined;
    }
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
  private async createCloudFormationStacksForALBIpForwarding(aseaConfig: AcceleratorConfig) {
    const vpcs = aseaConfig.getVpcConfigs();
    const vpcMaps = [];
    for (const vpc of vpcs) {
      if (vpc.vpcConfig['alb-forwarding']) {
        const albIpForwarderMap = new Map<string, string>();
        albIpForwarderMap.set('vpcName', vpc.vpcConfig.lzaVpcName ?? vpc.vpcConfig.name);
        albIpForwarderMap.set('region', vpc.vpcConfig.region);
        albIpForwarderMap.set('account', vpc.accountKey!);
        vpcMaps.push(albIpForwarderMap);
      }
    }
    const cloudFormationStacks = this.createCloudFormationStacksFromMap(vpcMaps);
    return cloudFormationStacks;
  }

  private async createCloudFormationStacksFromMap(vpcMaps: any[]) {
    const cloudFormationStacks = [];
    const aseaPrefixNoDash = this.aseaPrefix.replace(/-/g, '');
    for (const vpcMap of vpcMaps) {
      const vpcName = vpcMap.get('vpcName');
      const accountName = vpcMap.get('account');

      const region = vpcMap.get('region');
      const cloudFormationStack = {
        name: `${this.aseaPrefix}AlbIPForwardingStack-${vpcName}`,
        template: 'cloudformation/AlbIpForwardingStack.template.json',
        runOrder: 1,
        parameters: [
          {
            name: 'acceleratorPrefix',
            value: `${aseaPrefixNoDash}`,
          },
          {
            name: 'vpcName',
            value: `${vpcName}`,
          },
        ],
        terminationProtection: true,
        deploymentTargets: {
          accounts: [`${accountName}`],
        },
        regions: [`${region}`],
      };
      cloudFormationStacks.push(cloudFormationStack);
    }
    return cloudFormationStacks;
  }

  private async createDynamicPartitioningFile(aseaConfig: AcceleratorConfig) {
    const partitions = aseaConfig['global-options']['central-log-services']['dynamic-s3-log-partitioning'];
    //Add extra partition for vpc-flow-logs for new behavior
    partitions?.push({
      logGroupPattern: `${this.aseaPrefix}NetworkVpcStack*VpcFlowLogs*`,
      s3Prefix: 'vpcflowlogs',
    });

    if (partitions) {
      await this.writeToSources.writeFiles([
        {
          fileContent: JSON.stringify(partitions, null, 2),
          fileName: 'log-filters.json',
          filePath: 'dynamic-partitioning',
        },
      ]);
    }
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

  private rsyslogWarnings(aseaConfig: AcceleratorConfig) {
    for (const accountKey of Object.keys(aseaConfig['mandatory-account-configs'])) {
      if (aseaConfig['mandatory-account-configs'][accountKey].deployments?.rsyslog) {
        this.configCheck.addWarning(
          `rsyslog servers are deployed in ${accountKey}. Please refer to documentation on how to manage these resources after the upgrade.`,
        );
      }
    }
  }

  private madWarnings(aseaConfig: AcceleratorConfig) {
    for (const accountKey of Object.keys(aseaConfig['mandatory-account-configs'])) {
      if (aseaConfig['mandatory-account-configs'][accountKey].deployments?.mad) {
        this.configCheck.addWarning(
          `Managed AD is deployed in ${accountKey}. Please refer to documentation on how to manage these resources after the upgrade.`,
        );
      }
    }
  }
}
