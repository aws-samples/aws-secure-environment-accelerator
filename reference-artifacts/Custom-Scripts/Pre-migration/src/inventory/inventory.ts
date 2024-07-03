import * as fs from 'fs';
import { loadAseaConfig } from '../asea-config/load';
import * as WriteToSourcesTypes from '../common/utils/types/writeToSourcesTypes';
import { WriteToSources } from '../common/utils/writeToSources';
import {
  AcceleratorConfig,
    AccountConfig,
    OrganizationalUnitConfig
  } from '../asea-config';
import { ConfigCheck } from './config-checks';

type VpcOutput = {
  name: string,
  'cidr-src': string
  deploy: string,
  region: string,
  'alb-forwarding'?: boolean,
  nfw?: boolean,
  'opt-in'?: boolean,
  'vpc-peering'?: boolean,
  publicZones?: number,
  privateZones?: number
}

type DeploymentOutput = {
  tgw?: {name: string, region: string}[],
  mad?: { deploy: boolean, 'vpc-name': string, region: string}
  rsyslog?: { deploy: boolean, 'vpc-name': string, region: string},
  adc?: { deploy: boolean, 'vpc-name': string },
  firewalls?: { name: string, deploy: boolean, region: string, type: string | undefined} [],
  'firewall-manager'?: { vpc: string, region: string}
}

type InventoryOutput = {
  'home-region': string,
  'control-tower': boolean,
  'organization-admin-role': string | undefined,
  'accounts': number,
  'cidr-pools': number,
  'organizational-units': {
    name: string,
    accounts: number,
    alb: number,
    vpcs: VpcOutput[] | undefined,
    scps?: string[],
  }[],
  'accountsInfo': {
    key: string,
    deleted?: boolean,
    ou: string,
    vpcs: VpcOutput[] | undefined,
    'opt-in-vpcs'?: string[],
    alb?: number,
    'exclude-ou-albs'?: boolean,
    'account-scp'?: string[],
    deployments?: DeploymentOutput,
  }[],
  'custom-config-rules'?: string[],
  warnings: string[]
}

export class Inventory {
    private readonly localConfigFilePath: string;
    private readonly writeFilesConfig: WriteToSourcesTypes.WriteToSourcesConfig;
    private writeToSources: WriteToSources;
    private configCheck: ConfigCheck = new ConfigCheck();

    constructor(aseaConfigPath: string) {
        this.localConfigFilePath = aseaConfigPath;

        this.writeFilesConfig = {
          localOnly: true,
          localConfig: {
            baseDirectory: 'outputs/inventory',
          },
          region: 'ca-central-1', //HARDCODED. Not used for local writes but needed
        };

        this.writeToSources = new WriteToSources(this.writeFilesConfig);
    }

      async process() {

        if (!fs.existsSync(this.localConfigFilePath)) {
          throw new Error(`File ${this.localConfigFilePath} does not exist`);
        }

        const aseaConfig: AcceleratorConfig = await loadAseaConfig({
            filePath: '',
            repositoryName: '',
            defaultRegion: undefined,
            localFilePath: this.localConfigFilePath,
        });

        const accounts: [accountKey: string, accountConfig: AccountConfig][] = aseaConfig.getAccountConfigs();
        const ou: [ouKey: string, ouConfig: OrganizationalUnitConfig][] = aseaConfig.getOrganizationConfigs();

        const output: InventoryOutput = {
          'home-region': aseaConfig['global-options']['aws-org-management'].region,
          'control-tower':  aseaConfig['global-options']['ct-baseline'],
          'organization-admin-role': aseaConfig['global-options']['organization-admin-role'],
          'cidr-pools': aseaConfig['global-options']['cidr-pools'].length || 0,
          accounts: accounts.length,
          'custom-config-rules': undefined,
          'organizational-units': [],
          accountsInfo: [],
          warnings: []
        };

        ou.forEach(([ouName, ouConfig]) => {
          output['organizational-units'].push({
            name: ouName,
            accounts: accounts.filter(([, accountConfig]) => accountConfig['ou-path']?.startsWith(ouName) || accountConfig.ou === ouName).length,
            alb: ouConfig.alb?.length || 0,
            vpcs: ouConfig.vpc?.map(mapVpc),
            scps: ouConfig.scps
          });

          if (ouConfig.iam?.roles) {
            this.configCheck.checkIamWithExternalTrustPolicy(ouConfig.iam.roles, `ou ${ouName}`);
          }
        });

        accounts.forEach(([accountKey, accountConfig]) => {

          let deployments: DeploymentOutput | undefined = undefined;

          if (accountConfig.deployments) {
            deployments = this.getDeploymentsInfo(accountConfig);
          }

          const accountInfo = {
            key: accountKey,
            deleted: accountConfig.deleted ? true : undefined,
            ou: accountConfig['ou-path'] || accountConfig.ou,
            vpcs: accountConfig.vpc?.map(mapVpc),
            alb: accountConfig.alb ? accountConfig.alb?.length : undefined,
            'exclude-ou-albs': accountConfig['exclude-ou-albs'] ? true : undefined,
            'account-scp': accountConfig.scps,
            'opt-in-vpcs': accountConfig['opt-in-vpcs'],
            deployments: deployments
          };

          output.accountsInfo.push(accountInfo);

          if (accountConfig.iam?.roles) {
            this.configCheck.checkIamWithExternalTrustPolicy(accountConfig.iam.roles, `account ${accountKey}`);
          }
        })

        //Check for custom config rules
        if (aseaConfig['global-options']['aws-config']?.rules) {
          const customRules = aseaConfig['global-options']['aws-config']?.rules.filter(rule => rule.type === 'custom');
          output['custom-config-rules'] = customRules.map(rule => rule.name);

          customRules.forEach(rule => {
            if (rule.name !== 'EC2-INSTANCE-PROFILE' && rule.name !== 'EC2-INSTANCE-PROFILE-PERMISSIONS') {
              this.configCheck.addWarning(
                `Custom config rule ${rule.name} is defined. You need to define the permissions and add them to the configuration file. Please check the documentation for more details.`
              );
            }
          });
        }

        //check for unsupported configurations
        await this.configCheck.checkUnsupportedConfig(aseaConfig);
        const warnings = this.configCheck.getWarnings();
        output.warnings.push(...warnings);

        //write to file
        await this.writeToSources.writeFiles([
          {
            fileContent: JSON.stringify(output, null, 2),
            fileName: 'asea-inventory.json',
            filePath: '',
          },
        ]);

        this.configCheck.printWarnings();
      }

      getDeploymentsInfo(accountConfig: AccountConfig): DeploymentOutput {
        let deployments: DeploymentOutput = {
          tgw: undefined,
          mad: undefined,
          rsyslog: undefined,
          adc: undefined,
          firewalls: undefined,
          'firewall-manager': undefined
        }

        if (accountConfig.deployments?.tgw) {
          deployments.tgw = accountConfig.deployments?.tgw?.map(tgw => ({
            name: tgw.name,
            region: tgw.region.toString()
          }));
        }

        if (accountConfig.deployments?.mad && accountConfig.deployments.mad.deploy) {
          deployments.mad = {
            deploy: accountConfig.deployments.mad.deploy,
            'vpc-name': accountConfig.deployments.mad['vpc-name'],
            region: accountConfig.deployments.mad.region.toString()
          };
        }

        if (accountConfig.deployments?.rsyslog && accountConfig.deployments.rsyslog.deploy) {
          deployments.rsyslog = {
            deploy: accountConfig.deployments.rsyslog.deploy,
            'vpc-name': accountConfig.deployments.rsyslog['vpc-name'],
            region: accountConfig.deployments.rsyslog.region.toString()
          };
        }

        if (accountConfig.deployments?.adc && accountConfig.deployments.adc.deploy) {
          deployments.adc = {
            deploy: accountConfig.deployments.adc.deploy,
            'vpc-name': accountConfig.deployments.adc['vpc-name']
          };
        }

        if (accountConfig.deployments?.firewalls) {
          deployments.firewalls = accountConfig.deployments.firewalls.filter(fw => fw.deploy).map(fw => ({
            name: fw.name,
            deploy: fw.deploy,
            region: fw.region.toString(),
            type: fw.type
          }));
        }

        return deployments;
      }
}

function mapVpc(v: any): VpcOutput {
  return {
    name: v.name,
    deploy: v.deploy,
    'cidr-src': v['cidr-src'],
    region: v.region.toString(),
    'alb-forwarding': v['alb-forwarding'],
    nfw: v.nfw ? true : undefined,
    'opt-in': v['opt-in'] ? v['opt-in'] : undefined,
    'vpc-peering': v['pcx'] ? true : undefined ,
    publicZones: v.zones?.public ? v.zones?.public?.length : undefined,
    privateZones: v.zones?.private ? v.zones?.private?.length : undefined
  }
}