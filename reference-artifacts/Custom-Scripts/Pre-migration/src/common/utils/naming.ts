import { name } from "aws-sdk/clients/importexport";

// Subnets in ASEA are named as ${subnetName}_${vpcName}_az${subnetDefinition.az}_net
export const createSubnetName = (vpcName: string, subnetName: string, az: string) => `${subnetName}_${vpcName}_az${az}_net`;

export const createNatGatewayName = (subnetName: string, az: string) => `NATGW_${subnetName}_${az}_natgw`;

export const createNaclName = (vpcName: string, subnetName: string) => `${subnetName}_${vpcName}_nacl`;

export const vpcCidrsTableName = (accelPrefix: string) => `${accelPrefix}cidr-vpc-assign`;

export const subnetsCidrsTableName = (accelPrefix: string) => `${accelPrefix}cidr-subnet-assign`;

export const createTgwAttachName = (vpcName: string, tgwName: string) => `${vpcName}_${tgwName}_att`;

export const createVpcName = (vpcName: string, suffix?: string) => `${vpcName}_vpc${suffix || ''}`;

export const nfwRouteName = (routeTableName: string, destination: string) => destination === '0.0.0.0/0'? `${routeTableName}_nfw_route`: `${routeTableName}_nfw_${destination}_route`;

export const transitGatewayName = (name: string) => `${name}_tgw`;

export const transitGatewayPeerName = (sourceTgw: string, targetTgw: string) => `${sourceTgw}_to${targetTgw}_peer`;

export const peeringConnectionName = (source: name, target: name) => `${source}-${target}_pcx`;