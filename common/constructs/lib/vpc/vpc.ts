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

export interface RouteTables {
  [key: string]: string;
}

export interface Vpc {
  id: string;
  name: string;

  cidrBlock: string;
  additionalCidrBlocks: string[];

  subnets: Subnet[];
  securityGroups: SecurityGroup[];

  findSubnetByNameAndAvailabilityZone(name: string, az: string): Subnet;
  tryFindSubnetByNameAndAvailabilityZone(name: string, az: string): Subnet | undefined;

  findSubnetIdsByName(name: string): string[];
  tryFindSubnetIdsByName(name: string): string[];

  findSecurityGroupByName(name: string): SecurityGroup;
  tryFindSecurityGroupByName(name: string): SecurityGroup | undefined;

  findRouteTableIdByName(name: string): string;
  tryFindRouteTableIdByName(name: string): string | undefined;
}
