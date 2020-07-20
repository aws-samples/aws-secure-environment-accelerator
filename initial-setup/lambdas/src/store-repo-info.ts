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
  console.log(JSON.stringify(input, null, 2));

  const repoInfo = [input.sourceOwner, input.sourceRepo, input.sourceBranch, input.sourceCommitId, input.startTime];
  const param = await ssm.putParameter('/accelerator/version', repoInfo.join(','), 'StringList');
  console.log('Sucessfully put param:', param);
};
