import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';

export interface HandlerProperties {
  roles: string[];
  logBucketArn: string;
  logBucketName: string;
  logBucketKmsKeyArn: string | undefined;
}

export const handler = errorHandler(onEvent);

const kms = new AWS.KMS();
const s3 = new AWS.S3();
const logArchiveReadOnlySid = 'SSM Log Archive Read Only Roles';

interface Policy {
  Version: string;
  Statement: PolicyStatement[];
}

interface PolicyStatement {
  Sid: string;
  Effect: string;
  Action: string[];
  Principal: {
    AWS: string[];
  };
  Resource: string[] | string;
}

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(JSON.stringify(event, null, 2));

  // eslint-disable-next-line default-case
  switch (event.RequestType) {
    case 'Create':
      return onCreate(event);
    case 'Update':
      return onUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
}

async function getBucketPolicy(logBucketName: string) {
  try {
    const response = await s3
      .getBucketPolicy({
        Bucket: logBucketName,
      })
      .promise();
    if (response.Policy) {
      return JSON.parse(response.Policy);
    }
    return {};
  } catch (err) {
    console.error(err, err.stack);
    throw err;
  }
}

async function putBucketPolicy(logBucketName: string, policy: string) {
  try {
    await s3
      .putBucketPolicy({
        Bucket: logBucketName,
        Policy: policy,
      })
      .promise();
  } catch (err) {
    console.error(err, err.stack);
    throw err;
  }
}

async function getKmsKeyPolicy(keyArn: string | undefined) {
  if (keyArn) {
    try {
      const response = await kms
        .getKeyPolicy({
          KeyId: keyArn,
          PolicyName: 'default',
        })
        .promise();
      if (response.Policy) {
        return JSON.parse(response.Policy);
      }
      return {};
    } catch (err) {
      console.error(err, err.stack);
      throw err;
    }
  }
  return {};
}

async function putKmsKeyPolicy(keyArn: string | undefined, policy: string) {
  if (keyArn) {
    try {
      await kms
        .putKeyPolicy({
          KeyId: keyArn,
          Policy: policy,
          PolicyName: 'default',
        })
        .promise();
    } catch (err) {
      console.error(err, err.stack);
      throw err;
    }
  } else {
    console.error('No KMS Key configured for this bucket');
  }
}

function removeExistingReadOnlyStatement(policy: Policy) {
  policy.Statement = policy.Statement.filter(statement => statement['Sid'] !== logArchiveReadOnlySid);
  return policy;
}

async function constructPolicy(policy: Policy, statement: PolicyStatement, props: HandlerProperties) {
  if (Object.keys(policy).length > 0) {
    policy = removeExistingReadOnlyStatement(policy);
    if (props.roles.length > 0) {
      policy.Statement.push(statement);
    }
  } else {
    if (props.roles.length > 0) {
      policy = {
        Version: '2012-10-17',
        Statement: [statement],
      };
    }
  }
  return policy;
}

async function updateBucketPolicy(props: HandlerProperties, bucketPolicy: Policy) {
  const readOnlyStatement = {
    Sid: logArchiveReadOnlySid,
    Effect: 'Allow',
    Action: ['s3:GetObject'],
    Principal: {
      AWS: props.roles,
    },
    Resource: [`${props.logBucketArn}/*`],
  };
  const updatedBucketPolicy = await constructPolicy(bucketPolicy, readOnlyStatement, props);
  await putBucketPolicy(props.logBucketName, JSON.stringify(updatedBucketPolicy));
}

async function updateKeyPolicy(props: HandlerProperties, keyPolicy: Policy) {
  const readOnlyStatement = {
    Sid: logArchiveReadOnlySid,
    Effect: 'Allow',
    Action: ['kms:Decrypt', 'kms:DescribeKey', 'kms:GenerateDataKey'],
    Principal: {
      AWS: props.roles,
    },
    Resource: '*',
  };
  const updatedKeyPolicy = await constructPolicy(keyPolicy, readOnlyStatement, props);
  await putKmsKeyPolicy(props.logBucketKmsKeyArn, JSON.stringify(updatedKeyPolicy));
}

async function createOrUpdateBucketPolicy(props: HandlerProperties) {
  let bucketPolicy = await getBucketPolicy(props.logBucketName);
  if (Object.keys(bucketPolicy).length > 0 || props.roles.length > 0) {
    await updateBucketPolicy(props, bucketPolicy);
  }

  let keyPolicy = await getKmsKeyPolicy(props.logBucketKmsKeyArn);
  if (Object.keys(keyPolicy).length > 0 || props.roles.length > 0) {
    await updateKeyPolicy(props, keyPolicy);
  }
  return {};
}

async function onCreate(event: CloudFormationCustomResourceCreateEvent) {
  const props = getPropertiesFromEvent(event);
  await createOrUpdateBucketPolicy(props);
}

async function onUpdate(event: CloudFormationCustomResourceUpdateEvent) {
  const props = getPropertiesFromEvent(event);
  await createOrUpdateBucketPolicy(props);
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  const props = getPropertiesFromEvent(event);
  let bucketPolicy = await getBucketPolicy(props.logBucketName);
  let keyPolicy = await getKmsKeyPolicy(props.logBucketKmsKeyArn);

  if (Object.keys(bucketPolicy).length > 0) {
    const updatedStatements = removeExistingReadOnlyStatement(bucketPolicy.Statement);
    bucketPolicy.Statement = updatedStatements;
    const response = await putBucketPolicy(props.logBucketName, JSON.stringify(bucketPolicy));
  }

  if (Object.keys(keyPolicy).length > 0) {
    const updatedStatements = removeExistingReadOnlyStatement(keyPolicy.Statement);
    keyPolicy.Statement = updatedStatements;
    const response = await putKmsKeyPolicy(props.logBucketKmsKeyArn, JSON.stringify(keyPolicy));
  }
  return {};
}

function getPropertiesFromEvent(event: CloudFormationCustomResourceEvent) {
  return (event.ResourceProperties as unknown) as HandlerProperties;
}
