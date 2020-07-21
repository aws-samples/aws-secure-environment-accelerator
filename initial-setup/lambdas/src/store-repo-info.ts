import { SSM } from '@aws-pbmm/common-lambda/lib/aws/ssm';

interface StoreRepoInfoInput {
  sourceRepo: string;
  sourceBranch: string;
  sourceOwner: string;
  sourceCommitId: string;
  startTime: string;
}

const ssm = new SSM();

export const handler = async (input: StoreRepoInfoInput) => {
  console.log(`Storing Repo input...`);
  const output = JSON.stringify(input, null, 2);
  console.log(output);

  const param = await ssm.putParameter('/accelerator/version', output, 'String');
  console.log('Sucessfully put param:', param);
};
