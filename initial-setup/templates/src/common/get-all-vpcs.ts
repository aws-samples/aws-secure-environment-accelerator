import {
  VpcConfig,
  ResolvedVpcConfig,
} from '@aws-pbmm/common-lambda/lib/config';

export function getVpcConfig(vpcConfigs: ResolvedVpcConfig[], accountKey: string, vpcName: string): VpcConfig | undefined {
  const resolvedVpcConfig = vpcConfigs.find(r => r.accountKey === accountKey && r.vpcConfig.vpcName === vpcName)
  return resolvedVpcConfig?.vpcConfig;
}
