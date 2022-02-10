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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { ArtifactOutput, ArtifactOutputFinder } from '../src/artifacts';
import { StackOutput } from '../src/stack-output';

test('structured output extensions should work', () => {
  const outputs: StackOutput[] = [
    {
      accountKey: 'primary',
      region: 'ca-central-1',
      outputValue: JSON.stringify({
        type: ArtifactOutput.name,
        value: {
          accountKey: 'primary',
          artifactName: 'SCP',
          bucketArn: 'arn:aws:s3:::bucket-name',
          bucketName: 'bucket-name',
          keyPrefix: 'scp',
        },
      }),
    },
  ];

  const artifactOutput = ArtifactOutputFinder.findOneByName({
    outputs,
    artifactName: 'SCP',
  });

  expect(artifactOutput).toBeDefined();
  expect(artifactOutput.bucketName).toBe('bucket-name');
});
