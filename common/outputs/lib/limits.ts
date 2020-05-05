export enum Limit {
  VpcPerRegion = 'Amazon VPC/VPCs per Region',
  VpcInterfaceEndpointsPerVpc = 'Amazon VPC/Interface VPC endpoints per VPC',
  CloudFormationStackCount = 'AWS CloudFormation/Stack count',
  CloudFormationStackSetPerAdmin = 'AWS CloudFormation/Stack sets per administrator account',
  OrganizationsMaximumAccounts = 'AWS Organizations/Maximum accounts',
}

export interface LimitOutput {
  accountKey: string;
  limitKey: string;
  serviceCode: string;
  quotaCode: string;
  value: number;
}

export function tryGetQuotaByAccountAndLimit(
  limits: LimitOutput[],
  accountKey: string,
  limit: Limit,
): number | undefined {
  const limitOutput = limits.find(a => a.accountKey === accountKey && a.limitKey === limit);
  return limitOutput?.value;
}
