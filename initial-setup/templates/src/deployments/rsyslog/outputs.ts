import * as t from 'io-ts';

export const RsyslogRoleOutputType = t.interface(
  {
    roleArn: t.string,
  },
  'RsyslogAutoScalingRole',
);

export const RsyslogDnsOutputType = t.interface(
  {
    name: t.string,
    dns: t.string,
  },
  'RsyslogNlbDns',
);

export type RsyslogAutoScalingRoleOutput = t.TypeOf<typeof RsyslogRoleOutputType>;
export type RsyslogDnsOutputTypeOutput = t.TypeOf<typeof RsyslogDnsOutputType>;
