import * as t from 'io-ts';
import { createStructuredOutputFinder } from './structured-output';
import { StackOutput } from './stack-output';

export interface VpcSecurityGroupOutput {
  securityGroupId: string;
  securityGroupName: string;
}

export interface SecurityGroupsOutput {
  vpcId: string;
  vpcName: string;
  securityGroupIds: VpcSecurityGroupOutput[];
}

export const VpcSubnetOutput = t.interface({
  subnetId: t.string,
  subnetName: t.string,
  az: t.string,
  cidrBlock: t.string,
});

// export const VpcRouteTableOutput = t.interface({
//   routeTableId: t.string,
//   routeTableName: t.string,
// });

export const VpcSecurityGroupOutput = t.interface({
  securityGroupId: t.string,
  securityGroupName: t.string,
});

export const VpcOutput = t.interface(
  {
    accountKey: t.string,
    vpcId: t.string,
    vpcName: t.string,
    region: t.string,
    cidrBlock: t.string,
    additionalCidrBlocks: t.array(t.string),
    subnets: t.array(VpcSubnetOutput),
    // routeTables: t.array(VpcRouteTableOutput),
    routeTables: t.record(t.string, t.string),
    securityGroups: t.array(VpcSecurityGroupOutput),
  },
  'VpcOutput',
);

export type VpcOutput = t.TypeOf<typeof VpcOutput>;

export const VpcOutputFinder = createStructuredOutputFinder(VpcOutput, finder => ({
  tryFindOneByAccountAndRegionAndName: (props: {
    outputs: StackOutput[];
    vpcName?: string;
    accountKey?: string;
    region?: string;
  }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      predicate: output =>
        (props.accountKey === undefined || output.accountKey === props.accountKey) &&
        (props.region === undefined || output.region === props.region) &&
        (props.vpcName === undefined || output.vpcName === props.vpcName),
    }),
}));
