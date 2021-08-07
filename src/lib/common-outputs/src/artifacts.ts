import * as t from 'io-ts';
import { enums } from '@aws-accelerator/common-types';
import { createStructuredOutputFinder } from './structured-output';
import { StackOutput } from './stack-output';

export const ArtifactNameType = enums('ArtifactName', [
  'SCP',
  'Rdgw',
  'IamPolicy',
  'Rsyslog',
  'SsmDocument',
  'ConfigRules',
  'NFW'
]);

export type ArtifactName = t.TypeOf<typeof ArtifactNameType>;

export const ArtifactOutput = t.interface(
  {
    accountKey: t.string,
    artifactName: ArtifactNameType,
    bucketArn: t.string,
    bucketName: t.string,
    keyPrefix: t.string,
  },
  'ArtifactOutput',
);

export type ArtifactOutput = t.TypeOf<typeof ArtifactOutput>;

export const ArtifactOutputFinder = createStructuredOutputFinder(ArtifactOutput, finder => ({
  findOneByName: (props: { outputs: StackOutput[]; accountKey?: string; artifactName: ArtifactName }) =>
    finder.findOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      predicate: artifact => artifact.artifactName === props.artifactName,
    }),
}));
