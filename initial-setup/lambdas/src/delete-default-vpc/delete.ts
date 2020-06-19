import { EC2 } from '@aws-pbmm/common-lambda/lib/aws/ec2';
import { LoadConfigurationInput } from './../load-configuration-step';
import { Account } from '@aws-pbmm/common-outputs/lib/accounts';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';

interface DeleteVPCInput extends LoadConfigurationInput {
  account: Account;
  assumeRoleName: string;
}

export const handler = async (input: DeleteVPCInput): Promise<string[]> => {
  console.log(`Deleting Default VPC in account ...`);
  console.log(JSON.stringify(input, null, 2));
  const { account, assumeRoleName, configRepositoryName, configFilePath, configCommitId } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const acceleratorConfig = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });
  const accountId = account.id;
  const supportedRegions = acceleratorConfig['global-options']['supported-regions'];
  const excludeRegions = acceleratorConfig['global-options']['keep-default-vpc-regions'];
  const regions = supportedRegions.filter(r => !excludeRegions.includes(r));
  console.log(`${accountId}: Excluding Deletion of  Default VPC for regions from account "${accountId}"...`);
  console.log(`${accountId}: ${JSON.stringify(excludeRegions, null, 2)}`);
  const errors: string[] = [];
  const sts = new STS();
  const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
  for (const region of regions) {
    console.log(`Deleting Default vpc in ${region}`);
    try {
      const ec2 = new EC2(credentials, region);
      const defaultVpcs = await ec2.describeDefaultVpcs();
      if (!defaultVpcs || defaultVpcs.length === 0) {
        continue;
      }
      for (const vpc of defaultVpcs) {
        const deleteErrors = await deleteDefaultVpc(ec2, vpc.VpcId!, accountId, region);
        errors.push(...deleteErrors);
      }
    } catch (error) {
      errors.push(`${accountId}:${region}: ${error.code}: ${error.message}`);
      continue;
    }
  }

  console.log(`${accountId}: Errors `, JSON.stringify(errors, null, 2));
  return errors;
};

async function deleteDefaultVpc(ec2: EC2, vpcId: string, accountId: string, region: string): Promise<string[]> {
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
      errors.push(`${accountId}:${region}: ${error.code}: ${error.message}`);
    }
  }

  // Detach VPC From Internet Gateway
  const igws = await ec2.describeInternetGatewaysByVpc([vpcId]);
  for (const igw of igws || []) {
    try {
      await ec2.detachInternetGateway(vpcId, igw.InternetGatewayId!);
      await ec2.deleteInternetGateway(igw.InternetGatewayId!);
    } catch (error) {
      errors.push(`${accountId}:${region}: ${error.code}: ${error.message}`);
    }
  }
  // Deleting VPC
  try {
    await ec2.deleteVpc(vpcId);
  } catch (error) {
    errors.push(`${accountId}:${region}: ${error.code}: ${error.message}`);
  }
  return errors;
}
