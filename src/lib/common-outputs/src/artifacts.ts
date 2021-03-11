import * as t from 'io-ts';
import { enumType } from '@aws-accelerator/common-types';
import { createStructuredOutputFinder } from './structured-output';
import { StackOutput } from './stack-output';

export const ARTIFACT_NAMES = ['SCP', 'Rdgw', 'IamPolicy', 'Rsyslog', 'SsmDocument', 'ConfigRules'] as const;

export const ArtifactNameType = enumType<typeof ARTIFACT_NAMES[number]>(ARTIFACT_NAMES, 'ArtifactName');

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
