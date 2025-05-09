import { DynamoDB } from '../aws/dynamodb';

export interface VpcAssignedCidr {
  'vpc-name': string;
  status: string;
  cidr: string;
  region: string;
  'account-key': string;
  'account-ou-key': string;
  pool: string;
}

export interface SubnetAssignedCidr {
  'sub-pool': string;
  'subnet-pool': string;
  'status': string;
  'cidr': string;
  'vpc-name': string;
  'az': string;
  'region': string;
  'subnet-name': string;
  'account-key': string;
  'account-ou-key': string;
}

export async function loadVpcAssignedCidrs(tableName: string, client: DynamoDB): Promise<VpcAssignedCidr[]> {
  const cidrsResponse = await client.scan({
    TableName: tableName,
  });
  if (!cidrsResponse) {
    console.warn(`Did not find assignedCidrs in DynamoDB table "${tableName}"`);
    return [];
  }
  return cidrsResponse as unknown as VpcAssignedCidr[];
}

export async function loadSubnetAssignedCidrs(tableName: string, client: DynamoDB): Promise<SubnetAssignedCidr[]> {
  const cidrsResponse = await client.scan({
    TableName: tableName,
  });
  if (!cidrsResponse) {
    console.warn(`Did not find assignedCidrs in DynamoDB table "${tableName}"`);
    return [];
  }
  return cidrsResponse as unknown as SubnetAssignedCidr[];
}
