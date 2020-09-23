import * as t from 'io-ts';
import { createStructuredOutputFinder } from '@aws-accelerator/common-outputs/src/structured-output';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { createCfnStructuredOutput } from '../../common/structured-output';

export function createCertificateSecretName(certificateName: string): string {
  return `accelerator/certificates/${certificateName}`;
}

export const AcmOutput = t.interface(
  {
    certificateName: t.string,
    certificateArn: t.string,
  },
  'Acm',
);

export type AcmOutput = t.TypeOf<typeof AcmOutput>;

export const CfnAcmOutput = createCfnStructuredOutput(AcmOutput);

export const AcmOutputFinder = createStructuredOutputFinder(AcmOutput, finder => ({
  findOneByName: (props: { outputs: StackOutput[]; accountKey: string; region?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      region: props.region,
    }),
}));
