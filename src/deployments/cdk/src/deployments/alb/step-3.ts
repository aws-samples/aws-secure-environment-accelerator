import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { AccountStacks } from '../../common/account-stacks';
import { LoadBalancerEndpointOutputFinder } from '@aws-accelerator/common-outputs/src/elb';
import { Ec2AcceptVpcEndpointConnection } from '@aws-accelerator/custom-resource-accept-vpc-endpoint-connection';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';

export interface ElbStep3Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  outputs: StackOutput[];
}

export async function step3(props: ElbStep3Props) {
  const { accountStacks, config, outputs } = props;
  for (const [accountKey, _] of config.getAccountConfigs()) {
    const accountEndpoints = LoadBalancerEndpointOutputFinder.tryFindOneByAccount({
      outputs,
      accountKey,
    });
    if (accountEndpoints.length === 0) {
      continue;
    }

    const ec2OpsRole = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey,
      roleKey: 'Ec2Operations',
    });
    if (!ec2OpsRole) {
      console.warn(`No Ec2Operations found in account ${accountKey}`);
      continue;
    }
    const serviceRegionEndpoints: { region: string; serviceId: string; endpoints: string[] }[] = [];
    for (const endpoint of accountEndpoints) {
      const eServiceEndpointIndex = serviceRegionEndpoints.findIndex(
        sre => sre.serviceId === endpoint.serviceId && sre.region === endpoint.region,
      );
      if (eServiceEndpointIndex === -1) {
        serviceRegionEndpoints.push({
          endpoints: [endpoint.id],
          region: endpoint.region,
          serviceId: endpoint.serviceId,
        });
      } else {
        serviceRegionEndpoints[eServiceEndpointIndex].endpoints.push(endpoint.id);
      }
    }

    for (const { endpoints, region, serviceId } of serviceRegionEndpoints) {
      if (endpoints.length === 0) {
        continue;
      }
      const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, region);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${accountKey}`);
        continue;
      }
      new Ec2AcceptVpcEndpointConnection(accountStack, `EndpointConnectionAccept-${serviceId}`, {
        endpoints,
        serviceId,
        roleArn: ec2OpsRole.roleArn,
      });
    }
  }
}
