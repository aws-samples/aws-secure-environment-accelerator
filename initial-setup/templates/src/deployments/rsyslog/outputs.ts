import * as t from 'io-ts';
import { createCfnStructuredOutput } from '../../common/structured-output';
import { ImageIdOutput } from '@aws-pbmm/common-outputs/lib/ami-output';

export const RsyslogAutoScalingRoleOutput = t.interface(
  {
    roleArn: t.string,
  },
  'RsyslogAutoScalingRole',
);
export const RsyslogDnsOutputTypeOutput = t.interface(
  {
    name: t.string,
    dns: t.string,
  },
  'RsyslogNlbDns',
);

export type RsyslogAutoScalingRoleOutput = t.TypeOf<typeof RsyslogAutoScalingRoleOutput>;
export type RsyslogDnsOutputTypeOutput = t.TypeOf<typeof RsyslogDnsOutputTypeOutput>;
export const CfnRsyslogAutoScalingRoleOutput = createCfnStructuredOutput(RsyslogAutoScalingRoleOutput);
export const CfnRsyslogDnsOutputTypeOutput = createCfnStructuredOutput(RsyslogDnsOutputTypeOutput);
export const CfnRsyslogImageIdOutputTypeOutput = createCfnStructuredOutput(ImageIdOutput);
