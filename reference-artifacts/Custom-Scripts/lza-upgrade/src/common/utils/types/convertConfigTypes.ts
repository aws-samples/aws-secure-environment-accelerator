export type LzaNaclRuleType = {
  rule: number;
  protocol: number;
  fromPort: number;
  toPort: number;
  action: 'allow' | 'deny';
};
export type LzaNaclInboundRuleType = LzaNaclRuleType & {
  source?: string | { account?: string; vpc: string; subnet: string; region?: string };
};

export type LzaNaclOutboundRuleType = LzaNaclRuleType & {
  destination?: string | { account?: string; vpc: string; subnet: string; region?: string };
};

export type SubnetType = {
  name: string;
  availabilityZone: string;
  routeTable: string;
  ipv4CidrBlock: string;
  mapPublicIpOnLaunch?: boolean;
  shareTargets?: { organizationalUnits?: string[]; accounts?: string[] };
};

export type SecurityGroupRuleSubnetSource = { account: string; vpc: string; subnets: string[] };

export type SecurityGroupRuleSGSource = { securityGroups: string[] };

export type SecurityGroupRuleType = {
  description: string;
  types?: string[];
  tcpPorts?: number[];
  udpPorts?: number[];
  fromPort?: number;
  toPort?: number;
  sources: (string | SecurityGroupRuleSubnetSource | SecurityGroupRuleSGSource)[];
};

export type NestedOuType = {
  account: string;
  nestedOu: string;
};

export type NestedOuAndOuType = {
  ou: string;
  nestedOu: string;
};

export type ResolverEndpointRulesType = {
  name: string;
  domainName: string | undefined;
  ruleType: string;
  targetIps: { ip: string; port?: number }[];
};

export type ResolverEndpointsType =
| {
    name: string;
    vpc: string;
    subnets: string[];
    type: string;
    rules?: ResolverEndpointRulesType[];
  }
| undefined;


