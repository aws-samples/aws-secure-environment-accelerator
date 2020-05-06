// tslint:disable-next-line: interface-name
export interface Subnet {
  id: string;
  name: string;
  az: string;
  cidrBlock: string;
}

// tslint:disable-next-line: interface-name
export interface SecurityGroup {
  id: string;
  name: string;
}

// tslint:disable-next-line: interface-name
export interface Vpc {
  id: string;
  name: string;

  cidrBlock: string;
  additionalCidrBlocks: string[];

  subnets: Subnet[];
  securityGroups: SecurityGroup[];

  findSubnetByNameAndAvailabilityZone(name: string, az: string): Subnet;
  tryFindSubnetByNameAndAvailabilityZone(name: string, az: string): Subnet | undefined;

  findSecurityGroupByName(name: string): SecurityGroup;
  tryFindSecurityGroupByName(name: string): SecurityGroup | undefined;
}
