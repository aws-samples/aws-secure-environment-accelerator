import * as t from 'io-ts';

export const PcxOutputType = t.interface(
  {
    pcxId: t.string,
    vpcs: t.array(
      t.interface({
        accountKey: t.string,
        vpcId: t.string,
        vpcName: t.string,
      }),
    ),
  },
  'Pcx',
);

export type PcxOutput = t.TypeOf<typeof PcxOutputType>;
