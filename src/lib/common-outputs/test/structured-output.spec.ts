// tslint:disable:no-any
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
  expect(artifactOutput!.bucketName).toBe('bucket-name');
});
