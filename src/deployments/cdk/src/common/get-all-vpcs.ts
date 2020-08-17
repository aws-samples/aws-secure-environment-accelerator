import { VpcConfig, ResolvedVpcConfig } from '@aws-accelerator/common-config/src';

export function getVpcConfig(
  vpcConfigs: ResolvedVpcConfig[],
  accountKey: string,
  vpcName: string,
): VpcConfig | undefined {
  const resolvedVpcConfig = vpcConfigs.find(
    (r: ResolvedVpcConfig) => r.accountKey === accountKey && r.vpcConfig.name === vpcName,
  );
  return resolvedVpcConfig?.vpcConfig;
}
