import {
  AccountConfig,
  OrganizationalUnitConfig,
  AcceleratorConfig,
  VpcConfig,
} from '@aws-pbmm/common-lambda/lib/config';

export interface VpcConfigs {
  [key: string]: AccountConfig | OrganizationalUnitConfig;
}
/**
 * Returns all VPC Configs in both Mandatory account configs and oranizational units
 * @param acceleratorConfig Full Configuration Details
 */
export const getAllAccountVPCConfigs = (config: AcceleratorConfig): VpcConfigs => {
  const mandatoryAccountConfig = config['mandatory-account-configs'];
  const orgaizationalUnitsConfig = config['organizational-units'];
  const accConfigs: VpcConfigs = {};
  for (const [key, value] of Object.entries(mandatoryAccountConfig)) {
    if (value && value?.vpc) {
      accConfigs[key] = value;
    }
  }
  for (const [key, value] of Object.entries(orgaizationalUnitsConfig)) {
    if (value && value?.vpc) {
      accConfigs[key] = value;
    }
  }
  return accConfigs;
};

export function getVpcConfig(accountConfigs: VpcConfigs, accountKey: string, vpcName: string): VpcConfig | undefined {
  const vpcConfig = Object.entries(accountConfigs).find(
    x =>
      (x[0] === accountKey && x[1].vpc && x[1].vpc.name === vpcName) ||
      (x[1].vpc && x[1].vpc.deploy === accountKey && x[1].vpc.name === vpcName),
  )?.[1].vpc;
  return vpcConfig;
}
