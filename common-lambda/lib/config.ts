// TODO Use a library like io-ts to define the configuration structure

export type Cidr = string;

export type Region = 'ca-central';

export type Az = '1a' | '1b' | '1c' | '1d' | '1e' | '1f';

export interface AcceleratorConfig {
  'mandatory-account-configs': MandatoryAccountConfig;
}

export interface MandatoryAccountConfig {
  'shared-network': AccountConfig;
}

export interface AccountConfig {
  'account-name': string;
  email: string;
  ou: string;
  vpc: VpcConfig;
  deployments: { [key: string]: DeploymentConfig };
}

export interface VpcConfig {
  deploy: string;
  name: string;
  cidr: Cidr;
  region: Region;
  igw?: InternetGatewayConfig;
  vgw?: VirtualPrivateGatewayConfig;
  pcx?: PeeringConnectionConfig;
  natgw?: NatGatewayConfig;
  azs: {
    count: number;
    // TODO We might need to rework this part
    az1?: Az;
    az2?: Az;
    az3?: Az;
  };
  subnets: SubnetConfig[];
  'gateway-endpoints': GatewayEndpointType[];
  'route-tables': RouteTableConfig[];
  'tgw-attach': TransitGatewayAttachConfig;
  'interface-endpoints'?: InterfaceEndpointConfig;
}

export interface InternetGatewayConfig {
  // TODO
}

export interface VirtualPrivateGatewayConfig {
  // TODO
}

export interface PeeringConnectionConfig {
  // TODO
  source: string;
  vpc: VpcConfig['name'];
  subnets: SubnetConfig['name'][];
}

export interface NatGatewayConfig {
  // TODO
}

export interface SubnetConfig {
  name: string;
  'share-to-ou-accounts': boolean;
  // TODO We might need to rework this part
  az1?: SubnetAzConfig;
  az2?: SubnetAzConfig;
  az3?: SubnetAzConfig;
}

export interface SubnetAzConfig {
  'route-table': RouteTableConfig['name'];
  cidr: Cidr;
}

export type GatewayEndpointType = 'S3'
  | 'DynamoDB'
  | string; // TODO Define all endpoints here

export interface RouteTableConfig {
  name: 'default' | string;
  routes: RouteConfig[];
}

export interface RouteConfig {
  destination: string;
  target: string;
}

export type TransitGatewayAttachOption = 'DNS-support'
  | 'IPv6-support'
  | string; // TODO Define all attach options here

export interface TransitGatewayAttachConfig {
  'associate-to-tgw': string;
  'account': 'local' | string;
  'associate-type': 'ATTACH';
  'tgw-rt-associate': string[];
  'tgw-rt-propogate': string[];
  'blackhole-route': boolean,
  'attach-subnets': SubnetConfig['name'][],
  'options': TransitGatewayAttachOption[];
}

export type InterfaceEndpointName = 'access-analyzer'
  | 'application-autoscaling'
  | string; // TODO Define all endpoints here

export interface InterfaceEndpointConfig {
  create: boolean;
  subnet: SubnetConfig['name'];
  endpoints: InterfaceEndpointName[];
}

export type DeploymentFeature = 'DNS-support'
  | 'VPN-ECMP-support'
  | 'Default-route-table-association'
  | 'Default-route-table-propagation'
  | 'Auto-accept-sharing-attachments';

export interface DeploymentConfig {
  name: string;
  asn: number;
  features: { [key in DeploymentFeature]: boolean };
  'route-tables': string[];
}
