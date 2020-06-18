import { EC2 } from '@aws-pbmm/common-lambda/lib/aws/ec2';
import { LoadConfigurationInput } from './load-configuration-step';

export interface DeleteVPCInput extends LoadConfigurationInput {
  accountId: string;
}

export interface DeleteVPCOutput {
  vpcId?: string;
  accountId: string;
  errors?: string[];
}
const ec2 = new EC2();

export const handler = async (input: DeleteVPCInput): Promise<DeleteVPCOutput[] | undefined> => {
  console.log(`Deleting Default VPC in account ...`);
  console.log(JSON.stringify(input, null, 2));
  const { accountId } = input;
  let response: DeleteVPCOutput[] = [];
  const defaultVpcs = await ec2.describeDefaultVpcs();
  if (!defaultVpcs || defaultVpcs.length === 0) {
    return;
  }
  for (const vpc of defaultVpcs) {
    const errors = await deleteDefaultVpc(vpc.VpcId!);
    const resp = {
      vpcId: vpc.VpcId,
      errors: errors,
      accountId,
    };
    response.push(resp);
  }
  console.log(JSON.stringify(response, null, 2));
  return response;
};

async function deleteDefaultVpc(vpcId: string): Promise<string[]> {
  const errors: string[] = [];
  // List all Subnets to delete
  const subnets = await ec2.listSubnets({
    Filters: [
      {
        Name: 'vpc-id',
        Values: [vpcId],
      },
    ],
  });
  // Deleting Subnets
  for (const subnet of subnets) {
    try {
      await ec2.deleteSubnet(subnet.SubnetId!);
    } catch (error) {
      errors.push(error.message);
    }
  }

  // Detach VPC From Internet Gateway
  const igws = await ec2.describeInternetGatewaysByVpc([vpcId]);
  for (const igw of igws || []) {
    try {
      await ec2.detachInternetGateway(vpcId, igw.InternetGatewayId!);
      await ec2.deleteInternetGateway(igw.InternetGatewayId!);
    } catch (error) {
      errors.push(error.message);
    }
  }
  // Deleting VPC
  try {
    await ec2.deleteVpc(vpcId);
  } catch (error) {
    errors.push(error.message);
  }
  return errors;
}
handler({
  accountId: '',
  configCommitId: '',
  configFilePath: '',
  configRepositoryName: '',
});
