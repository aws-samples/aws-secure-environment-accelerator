import mri from 'mri';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { S3 } from '@aws-accelerator/common/src/aws/s3';
import accounts from './accounts.json';
import context from './context.json';

const sts = new STS();

async function cleanupCdkBuckets() {
  for (const account of accounts) {
    if (account.key === 'master') {
      continue;
    }

    const creds = await sts.getCredentialsForAccountAndRole(account.id, context.acceleratorExecutionRoleName);
    const s3 = new S3(creds);

    // @ts-ignore
    const listBuckets = await s3.client.listBuckets().promise();
    for (const bucket of listBuckets.Buckets || []) {
      const bucketName = bucket.Name!;
      if (bucket.Name!.startsWith('cdktoolkit')) {
        // @ts-ignore
        const listObjects = await s3.client
          .listObjectsV2({
            Bucket: bucketName,
          })
          .promise();
        for (const object of listObjects.Contents || []) {
          const objectKey = object.Key!;
          if (objectKey.includes('.zip')) {
            console.log(`Deleting object s3://${bucketName}/${objectKey}...`);
            // @ts-ignore
            await s3.client
              .deleteObject({
                Bucket: bucketName,
                Key: objectKey,
              })
              .promise();
          }
        }
      }
    }
  }
}

async function listEmptyCdkObjects() {
  for (const account of accounts) {
    const creds = await sts.getCredentialsForAccountAndRole(account.id, context.acceleratorExecutionRoleName);
    const s3 = new S3(creds);

    // @ts-ignore
    const listBuckets = await s3.client.listBuckets().promise();
    for (const bucket of listBuckets.Buckets || []) {
      const bucketName = bucket.Name!;
      if (bucket.Name!.startsWith('cdktoolkit')) {
        // @ts-ignore
        const listObjects = await s3.client
          .listObjectsV2({
            Bucket: bucketName,
          })
          .promise();
        for (const object of listObjects.Contents || []) {
          const objectKey = object.Key!;
          if (object.Size === 0) {
            console.log(`s3://${bucketName}/${objectKey} ${object.Size}`);
          }
        }
      }
    }
  }
}

async function main() {
  const usage = `Usage: tools.ts <command>`;
  const args = mri(process.argv.slice(2));

  const commands = args['_'];
  if (commands.length !== 1) {
    console.log(usage);
    return;
  }

  if (commands.includes('cleanup-cdk-buckets')) {
    cleanupCdkBuckets();
  } else if (commands.includes('list-cdk-buckets')) {
    listEmptyCdkObjects();
  }
}

main();
