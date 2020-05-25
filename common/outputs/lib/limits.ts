export enum Limit {
  Ec2Eips = 'Amazon EC2/Number of EIPs',
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
