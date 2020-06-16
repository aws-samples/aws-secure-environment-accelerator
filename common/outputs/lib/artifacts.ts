import * as t from 'io-ts';
import { enumType } from '@aws-pbmm/common-types';
import { StackOutput } from './stack-output';
import { findValueFromOutputs } from './structured-output';

export const ARTIFACT_NAMES = ['SCP', 'Rdgw', 'IamPolicy'] as const;

export const ArtifactNameType = enumType<typeof ARTIFACT_NAMES[number]>(ARTIFACT_NAMES, 'ArtifactName');

export type ArtifactName = t.TypeOf<typeof ArtifactNameType>;

export const ArtifactOutputType = t.interface(
  {
    accountKey: t.string,
    artifactName: ArtifactNameType,
    bucketArn: t.string,
    bucketName: t.string,
    keyPrefix: t.string,
  },
  'ArtifactOutput',
);

export type ArtifactOutput = t.TypeOf<typeof ArtifactOutputType>;

export function findArtifactWithName(props: {
  outputs: StackOutput[];
  accountKey?: string;
  artifactName: string;
}): ArtifactOutput {
  return findValueFromOutputs({
    outputs: props.outputs,
    type: ArtifactOutputType,
    accountKey: props.accountKey,
    predicate: artifact => artifact.artifactName === props.artifactName,
  });
}
