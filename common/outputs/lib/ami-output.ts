import * as t from 'io-ts';
import { createStructuredOutputFinder } from './structured-output';
import { StackOutput } from './stack-output';

export const ImageIdOutput = t.interface(
  {
    imageId: t.string,
    imagePath: t.string,
    imageKey: t.string,
  },
  'SsmPathImageId',
);

export type ImageIdOutput = t.TypeOf<typeof ImageIdOutput>;

export const ImageIdOutputFinder = createStructuredOutputFinder(ImageIdOutput, finder => ({
  tryFindOneByName: (props: { outputs: StackOutput[]; accountKey: string; imageKey?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      predicate: o => o.imageKey === props.imageKey,
    }),
}));
