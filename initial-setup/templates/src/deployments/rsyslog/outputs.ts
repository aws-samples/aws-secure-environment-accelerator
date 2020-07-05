import * as t from 'io-ts';

export const RsyslogRoleOutputType = t.interface(
  {
    roleArn: t.string,
  },
  'RsyslogAutoScalingRole',
);

export type RsyslogAutoScalingRoleOutput = t.TypeOf<typeof RsyslogRoleOutputType>;
