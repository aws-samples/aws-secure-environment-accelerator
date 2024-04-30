/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as fs from 'fs';
import * as path from 'path';
import {
  CloudFormationClient,
  CloudFormationServiceException,
  DeleteStackCommand,
  DescribeStacksCommand,
  DescribeStacksCommandOutput,
  GetTemplateCommand,
  UpdateTerminationProtectionCommand,
} from '@aws-sdk/client-cloudformation';

import {
  ECRClient,
  RepositoryNotFoundException,
  BatchDeleteImageCommand,
  ListImagesCommand,
  ListImagesCommandOutput,
} from '@aws-sdk/client-ecr';
import { EventBridgeClient, DisableRuleCommand } from '@aws-sdk/client-eventbridge';
import { KMSClient, ListAliasesCommand, GetKeyPolicyCommand, PutKeyPolicyCommand } from '@aws-sdk/client-kms';

import { SSMClient, PutParameterCommandInput, PutParameterCommand } from '@aws-sdk/client-ssm';

export async function updateSecretsKey(prefix: string, operationsAccountId: string, region: string): Promise<void> {
  const kmsClient = new KMSClient({ region: region });
  const keyAliases = await kmsClient.send(new ListAliasesCommand({}));
  const keyAlias = keyAliases.Aliases?.find((alias) => alias.AliasName === `alias/${prefix}-Secrets-Key-7E0BF09A`);
  if (!keyAlias) {
    console.log('No key alias found');
    return;
  }
  const keyPolicy = await kmsClient.send(
    new GetKeyPolicyCommand({
      KeyId: keyAlias?.TargetKeyId,
      PolicyName: 'default',
    }),
  );
  const policy = JSON.parse(keyPolicy.Policy ?? '');
  for (const statement of policy.Statement) {
    if (statement.Sid === 'LZA') {
      console.log('Key policy already updated');
      return;
    }
  }

  policy.Statement.push({
    Sid: 'LZA',
    Effect: 'Allow',
    Principal: {
      AWS: `arn:aws:iam::${operationsAccountId}:root`,
    },
    Action: ['kms:*'],
    Resource: '*',
  });

  console.log(JSON.stringify(policy));
  console.log('Updating key policy');

  await kmsClient.send(
    new PutKeyPolicyCommand({
      KeyId: keyAlias?.TargetKeyId,
      Policy: JSON.stringify(policy),
      PolicyName: 'default',
    }),
  );
}

export async function backupCloudformationStack(stackName: string, region: string): Promise<void> {
  try {
    fs.mkdirSync('./backup');
  } catch (e: any) {
    if (e.code !== 'EEXIST') {
      throw e;
    }
  }
  let cloudformationClient = new CloudFormationClient({ region: region });
  try {
    const describeStacksResponse = await cloudformationClient.send(new DescribeStacksCommand({ StackName: stackName }));
    fs.writeFileSync(
      path.join(__dirname, `../../backup/${stackName}-${region}-parameters.json`),
      JSON.stringify(describeStacksResponse.Stacks![0].Parameters, null, 2),
      'utf-8',
    );
  } catch (e: any) {
    if (e.Code === 'ValidationError' || e instanceof CloudFormationServiceException) {
      console.log(`Stack ${stackName} not found in region ${region}`);
      return;
    } else {
      throw e;
    }
  }
  try {
    const getTemplateResponse = await cloudformationClient.send(new GetTemplateCommand({ StackName: stackName }));
    fs.writeFileSync(
      path.join(__dirname, `../../backup/${stackName}-${region}-template.json`),
      getTemplateResponse.TemplateBody!,
    );
  } catch (e: any) {
    if (e.Code === 'ValidationError' || e instanceof CloudFormationServiceException) {
      console.log(`Stack ${stackName} not found in region ${region}`);
      return;
    } else {
      throw e;
    }
  }
}

export async function deleteCloudformationStack(stackName: string, region: string): Promise<void> {
  let cloudformationClient = new CloudFormationClient({
    region: region,
  });
  try {
    await cloudformationClient.send(
      new UpdateTerminationProtectionCommand({
        StackName: stackName,
        EnableTerminationProtection: false,
      }),
    );
    await cloudformationClient.send(new DeleteStackCommand({ StackName: stackName }));
  } catch (e: any) {
    if (e.Code === 'ValidationError' || e instanceof CloudFormationServiceException) {
      console.log(`Stack ${stackName} not found in region ${region}`);
      return;
    } else {
      throw e;
    }
  }
  console.log(`Deleted stack ${stackName} stack in ${region}`);
  let describeStacksResponse: DescribeStacksCommandOutput;

  let stackStatus: string;
  do {
    try {
      describeStacksResponse = await cloudformationClient.send(new DescribeStacksCommand({ StackName: stackName }));
    } catch (e: any) {
      if (e instanceof CloudFormationServiceException) {
        return;
      } else {
        throw e;
      }
    }
    if (describeStacksResponse.Stacks?.length === 0) {
      return;
    } else {
      stackStatus = describeStacksResponse.Stacks![0].StackStatus ?? 'UNKNOWN';
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } while (stackStatus === 'DELETE_IN_PROGRESS');

  if (stackStatus === 'DELETE_FAILED') {
    console.log(
      `Delete stack ${stackName} in ${region} failed. See CloudFormation console for reason. Correct issue and re-run`,
    );
    throw new Error('Stack deletion failed.');
  }
}

export async function deleteEcrImages(accountId: string, region: string): Promise<void> {
  const ecrClient = new ECRClient({ region: region });

  let ecrImages: ListImagesCommandOutput | undefined = undefined;
  try {
    ecrImages = await ecrClient.send(
      new ListImagesCommand({
        repositoryName: `cdk-hnb659fds-container-assets-${accountId}-${region}`,
      }),
    );
  } catch (e: any) {
    if (e instanceof RepositoryNotFoundException) {
      console.log('No images found');
      return;
    }
  }

  if (!ecrImages || ecrImages.imageIds!.length === 0) {
    console.log('No images found');
    return;
  }
  for (const image of ecrImages.imageIds!) {
    console.log(`Deleting image ${image.imageTag}`);
    await ecrClient.send(
      new BatchDeleteImageCommand({
        repositoryName: `cdk-hnb659fds-container-assets-${accountId}-${region}`,
        imageIds: [{ imageTag: image.imageTag }],
      }),
    );
  }
}

export async function setSSMMigrationParameter(region: string) {
  const client = new SSMClient({ region });
  const parameterInput: PutParameterCommandInput = {
    Name: '/accelerator/migration',
    Value: 'true',
    Overwrite: true,
    Type: 'String',
  };

  const command = new PutParameterCommand(parameterInput);
  try {
    await client.send(command);
    console.log('Added migration SSM parameter');
  } catch (err) {
    console.log(err);
  }
}

export async function disableASEARules(prefix: string) {
  const globalRegion = 'us-east-1';
  const client = new EventBridgeClient({ region: globalRegion });
  const suffixes = [
    'CreateAccount_rule',
    'CreateOrganizationalUnit_rule',
    'MoveAccount_rule',
    'PolicyChanges_rule',
    'RemoveAccount_rule',
  ];

  const disableRuleCommands: DisableRuleCommand[] = suffixes.map((suffix) => {
    return new DisableRuleCommand({
      Name: `${prefix}-${suffix}`,
    });
  });

  const disableRulePromises = disableRuleCommands.map((command) => {
    console.log(`Disabling rule ${command.input.Name}`);
    return client.send(command);
  });
  await Promise.all(disableRulePromises);
  console.log('Disabled Rules');
}
