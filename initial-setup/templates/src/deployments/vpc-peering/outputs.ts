import * as t from 'io-ts';

export const PcxOutputType = t.interface(
  {
    vpcId: t.string,
    vpcName: t.string,
    pcxId: t.string,
  },
  'Pcx',
);

export type PcxOutput = t.TypeOf<typeof PcxOutputType>;
