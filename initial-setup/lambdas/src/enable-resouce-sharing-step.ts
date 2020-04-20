import * as aws from 'aws-sdk';
import { RAM } from '@aws-pbmm/common-lambda/lib/aws/ram';

export const handler = async () => {
  console.log(`Enable resource sharing between the accounts in an organization ...`);

  // Enable resource sharing within the Orgnization
  const ram = new RAM();
  await ram.enableResourceSharing();

  return {
    status: 'SUCCESS',
    statusReason: `Successfully enabled resource sharing access with in AWS Organization`,
  };
};
