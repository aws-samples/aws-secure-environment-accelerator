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

  const commitId = process.env.CODEBUILD_SOURCE_VERSION;
  console.log('CODEBUILD_SOURCE_VERSION', commitId);
  console.log('passed commit id', input.sourceCommitId);

  const repoInfo = [input.sourceOwner, input.sourceRepo, input.sourceBranch, commitId, input.startTime];
  const param = await ssm.putParameter('/accelerator/version', repoInfo.join(','), 'StringList');
  console.log('Sucessfully put param:', param);
};
