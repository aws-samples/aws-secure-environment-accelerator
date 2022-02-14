/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

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
  'NFW',
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
