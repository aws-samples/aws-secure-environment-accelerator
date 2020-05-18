import * as t from 'io-ts';

export const MadAutoScalingRoleOutputType = t.interface(
  {
    roleArn: t.string,
  },
  'MadAutoScalingRole',
);

export type MadAutoScalingRoleOutput = t.TypeOf<typeof MadAutoScalingRoleOutputType>;
