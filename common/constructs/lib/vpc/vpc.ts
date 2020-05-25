export interface Subnet {
  id: string;
  name: string;
  az: string;
  cidrBlock: string;
}

export interface SecurityGroup {
  id: string;
  name: string;
}

export interface Vpc {
  id: string;
  name: string;

  cidrBlock: string;
  additionalCidrBlocks: string[];

  subnets: Subnet[];
  securityGroups: SecurityGroup[];

  findSubnetByNameAndAvailabilityZone(name: string, az: string): Subnet | undefined;
  tryFindSubnetByNameAndAvailabilityZone(name: string, az: string): Subnet | undefined;

  findSecurityGroupByName(name: string): SecurityGroup | undefined;
  tryFindSecurityGroupByName(name: string): SecurityGroup | undefined;
}
