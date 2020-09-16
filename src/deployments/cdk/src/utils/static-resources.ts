import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';

export interface StaticResource {
  id: string;
  region: string;
  accountKey: string;
  suffix: number;
  resourceType: string;
  resources: string[];
}

const dynamodb = new DynamoDB();

export async function loadStaticResources(tableName: string): Promise<StaticResource[]> {
  const staticResources: StaticResource[] = [];
  const staticResourcesResponse = await dynamodb.scan({
    TableName: tableName,
  });
  if (!staticResourcesResponse) {
    console.warn(`Did not find outputs in DynamoDB table "${tableName}"`);
    return staticResources;
  }
  for (const item of staticResourcesResponse) {
    const cVal: StaticResource = {
      accountKey: item.accountKey.S!,
      id: item.id.S!,
      region: item.region.S!,
      resourceType: item.resourceType.S!,
      resources: JSON.parse(item.resources.S!),
      suffix: parseInt(item.suffix.N!, 10),
    };
    staticResources.push(cVal);
  }
  return staticResources;
}
