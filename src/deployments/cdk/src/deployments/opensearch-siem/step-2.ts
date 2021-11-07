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
import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as sqs from '@aws-cdk/aws-sqs';
import * as iam from '@aws-cdk/aws-iam';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as lambda from '@aws-cdk/aws-lambda';
import { SqsEventSource } from '@aws-cdk/aws-lambda-event-sources';
import { OpenSearchDomain } from '@aws-accelerator/cdk-constructs/src/database';
import { CognitoIdentityPoolRoleMapping, CognitoIdentityPool, CognitoUserPool, CognitoUserPoolDomain } from '@aws-accelerator/cdk-constructs/src/cognito';
import { Vpc } from '@aws-accelerator/cdk-constructs/src/vpc';
import { AcceleratorConfig, OpenSearchSIEMConfig } from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { AcceleratorStack } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-stack';
import { SecurityGroup } from '../../common/security-group';
import { StructuredOutput } from '../../common/structured-output';
import { CfnOpenSearchClusterDnsOutput, CfnSiemQueueArnOutput, OpenSearchLambdaProcessingRoleOutput } from './outputs';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { Context } from '../../utils/context';
import { EbsKmsOutput } from '@aws-accelerator/common-outputs/src/ebs';
import { IamRoleNameOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { Sqs } from '@aws-accelerator/cdk-constructs/src/sqs';
import { CentralBucketOutputFinder } from '@aws-accelerator/common-outputs/src/central-bucket';
import { OpenSearchSiemConfigure } from '@aws-accelerator/custom-resource-opensearch-siem-configure';
import { HostedZoneOutputFinder } from '@aws-accelerator/common-outputs/src/hosted-zone';

import path from 'path';

export interface OpenSearchSIEMStep2Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  outputs: StackOutput[];
  vpcs: Vpc[];
  logArchiveBucket: s3.IBucket;
  context: Context;
  aesLogArchiveBucket: s3.IBucket;
  processingTimeout?: number;
}

export async function step2(props: OpenSearchSIEMStep2Props) {
  const { accountStacks, config, outputs, vpcs, logArchiveBucket, context, aesLogArchiveBucket, processingTimeout = 900 } = props;

  for (const [accountKey, accountConfig] of config.getMandatoryAccountConfigs()) {
    const openSearchSIEMDeploymentConfig = accountConfig.deployments?.siem;
    if (!openSearchSIEMDeploymentConfig || !openSearchSIEMDeploymentConfig.deploy) {
      continue;
    }

    const vpc = vpcs.find(v => v.name === openSearchSIEMDeploymentConfig['vpc-name']);
    if (!vpc) {
      console.log(`Skipping OpenSearch deployment because of missing VPC "${openSearchSIEMDeploymentConfig['vpc-name']}"`);
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    const openSearchAdminRoleOutput = IamRoleNameOutputFinder.tryFindOneByName({
      outputs,
      accountKey,
      roleName: openSearchSIEMDeploymentConfig['opensearch-instance-role'],
      roleKey: "IamAccountRole"
    });
    if (!openSearchAdminRoleOutput) {
      console.warn(`Cannot find OpenSearch role ${openSearchSIEMDeploymentConfig['opensearch-instance-role']}`);
      return;
    }
    const openSearchAdminRoleArn = openSearchAdminRoleOutput.roleArn;

    const accountEbsEncryptionKeys = StructuredOutput.fromOutputs(outputs, {
      accountKey,
      type: EbsKmsOutput,
    });
    if (accountEbsEncryptionKeys.length !== 1) {
      console.warn(`Cannot find required EBS KMS Key role in account "${accountKey}"`);
      return;
    }
    const accountEbsEncryptionKeyId = accountEbsEncryptionKeys[0].encryptionKeyId;


    const domainSubnetIds: string[] = [];
    for (const subnetConfig of openSearchSIEMDeploymentConfig['app-subnets']) {
      const subnet = vpc.tryFindSubnetByNameAndAvailabilityZone(subnetConfig.name, subnetConfig.az);
      if (!subnet) {
        console.warn(`Cannot find app subnet with name "${subnetConfig.name}" in availability zone "${subnetConfig.az}"`);
        continue;
      }
      domainSubnetIds.push(subnet.id);
    }

    if (domainSubnetIds.length === 0) {
      console.log(`Skipping OpenSearch deployment because of missing app subnets "${openSearchSIEMDeploymentConfig['app-subnets']}"`);
      return;
    }

    // Get STS Hosted Zones        
    const hostedZoneOutputs = HostedZoneOutputFinder.findAll({
      outputs
    });
    const stsHostedZoneDnsEntries = hostedZoneOutputs.filter(hzo => hzo.serviceName === 'sts').map(hostedZone => hostedZone.aliasTargetDns);
    const stsDnsEntries = ['sts.amazonaws.com', ...stsHostedZoneDnsEntries];

    const openSearchSiemProcessingRoleOutput = StructuredOutput.fromOutputs(outputs, {
      accountKey,
      type: OpenSearchLambdaProcessingRoleOutput,
    });
    if (openSearchSiemProcessingRoleOutput.length !== 1) {
      console.warn(`Cannot find required OpenSearchSiemProcessing role in account "${accountKey}"`);
      return;
    }
    const openSearchSiemProcessingRoleArn = openSearchSiemProcessingRoleOutput[0].roleArn;


    // Central Bucket
    const masterAccountKey = config.getMandatoryAccountKey('master');
    const centralBucketOutput = CentralBucketOutputFinder.findOneByName({
      outputs,
      accountKey: masterAccountKey,
    });

    // creating security group for the instance
    const securityGroup = new SecurityGroup(accountStack, `OpenSearchSiemSG${accountKey}`, {
      securityGroups: openSearchSIEMDeploymentConfig['security-groups'],
      accountKey,
      vpcId: vpc.id,
      vpcName: vpc.name,
      installerVersion: context.installerVersion,
    });
    const securityGroupId = securityGroup.securityGroups[0].id;

    const azs = new Set(vpc.subnets.map(x => x.az));

    const lambdaRole = iam.Role.fromRoleArn(accountStack, `${context.acceleratorPrefix}OpenSearchSiemProcessEventsLambdaRole`, openSearchSiemProcessingRoleArn, {
      mutable: true,
    });

    lambdaRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [openSearchAdminRoleArn]
      })
    );

    createOpenSearchCluster(
      accountKey,
      openSearchSIEMDeploymentConfig,
      accountStack,            
      context.acceleratorPrefix,
      accountEbsEncryptionKeyId,
      openSearchAdminRoleArn,
      domainSubnetIds,
      [securityGroupId],
      vpc,
      [...azs],
      lambdaRole,
      centralBucketOutput.bucketName,
      stsDnsEntries
    );

    const eventQueue = createSQS(
      accountStack,
      context.acceleratorPrefix,
      aesLogArchiveBucket,
      logArchiveBucket,
      processingTimeout
    );
   
    createProcessingLambda(
      vpc,
      [...azs],
      domainSubnetIds,
      securityGroup,
      accountStack,
      context.acceleratorPrefix,
      eventQueue,
      processingTimeout,
      lambdaRole
    );
  }
}

export function createProcessingLambda(
  vpc: Vpc,
  azs: string[],
  domainSubnetIds: string[],
  securityGroup: SecurityGroup,
  accountStack: AcceleratorStack,
  acceleratorPrefix: string,
  eventQueue: sqs.IQueue,
  processingTimeout: number,
  lambdaRole: iam.Role
) {

  const lambdaPath = require.resolve('@aws-accelerator/deployments-runtime');
  const lambdaDir = path.dirname(lambdaPath);
  const lambdaCode = lambda.Code.fromAsset(lambdaDir);

  const cdkVpc = ec2.Vpc.fromVpcAttributes(accountStack, 'OpenSearchVPCLookupAttr', {
    vpcId: vpc.id,
    availabilityZones: [...azs],
    privateSubnetIds: domainSubnetIds
  })
  const vpc_sg = [];
  for (const sg of securityGroup.securityGroups) {
    const tmp = ec2.SecurityGroup.fromSecurityGroupId(accountStack, `OpenSearchVPCLookup-${sg.name}`, sg.id);
    vpc_sg.push(tmp);
  }

 

  const eventProcessingLambda = new lambda.Function(accountStack, `${acceleratorPrefix}OpenSearchSiemProcessEvents`, {
    runtime: lambda.Runtime.NODEJS_14_X,
    code: lambdaCode,
    role: lambdaRole,
    handler: 'index.openSearchSiemEventsProcessor.openSearchSiemProcessEvents',
    timeout: cdk.Duration.seconds(processingTimeout),
    vpc: cdkVpc,
    memorySize: 2048,
    vpcSubnets: {
      subnetFilters: [ec2.SubnetFilter.byIds(domainSubnetIds)],
    },
    securityGroups: vpc_sg,
    environment: {
    },
  });

  eventProcessingLambda.addEventSource(new SqsEventSource(eventQueue, {
    enabled: false
  }));

}

export function createSQS(
  accountStack: AcceleratorStack,
  acceleratorPrefix: string,
  aesLogArchiveBucket: s3.IBucket,
  logArchiveBucket: s3.IBucket,
  visibilityTimeout: number
): sqs.IQueue {
  const queue = new Sqs(accountStack, 'SiemQueue', {
    queueName: `${acceleratorPrefix}SiemQueue`,
    visibilityTimeout: visibilityTimeout
  });

  for (const bucket of [logArchiveBucket, aesLogArchiveBucket]) {
    queue.IQueue.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sqs:SendMessage', 'sqs:GetQueueAttributes', 'sqs:GetQueueUrl'],
        resources: [queue.arn],
        principals: [new iam.ServicePrincipal('s3.amazonaws.com')],
        conditions: {
          ['ArnLike']: {
            'aws:SourceArn': bucket.bucketArn
          }
        }
      })
    );
  }

  new CfnSiemQueueArnOutput(accountStack, 'SiemQueueArn', {
    queueArn: queue.arn
  });

  return queue.IQueue;
}

export function createOpenSearchCluster(
  accountKey: string,
  openSearchSIEMDeploymentConfig: OpenSearchSIEMConfig,
  accountStack: AcceleratorStack,  
  acceleratorPrefix: string,
  accountEbsEncryptionKeyId: string,
  adminRole: string,
  domainSubnetIds: string[],
  securityGroupIds: string[],
  vpc: Vpc,
  azs: string[],
  lambdaRole: iam.Role,
  centralConfigBucketName: string,
  stsHostedZoneDnsEntries: string[]
) {

  const cognitoUserPool = new CognitoUserPool(accountStack, `${acceleratorPrefix}OpenSearchSiemUserPool`, {
    userPoolName: 'OpenSearchSiemUserPool',
    usernameAttributes: ["email"],
  });

  const cognitoIdentityPool = new CognitoIdentityPool(accountStack, `${acceleratorPrefix}OpenSearchSiemIdenittyPool`, {
    identityPoolName: 'OpenSearchSiemIdentityPool',
    allowUnauthenticatedIdentities: false,
  });

  const authenticatedRole = new iam.Role(accountStack, `${acceleratorPrefix}OpenSearchSiemIdentityAuthRole`, {
    assumedBy: new iam.WebIdentityPrincipal('cognito-identity.amazonaws.com', {
      "StringEquals": {
        "cognito-identity.amazonaws.com:aud": cognitoIdentityPool.id
      },
      "ForAnyValue:StringLike": {
        "cognito-identity.amazonaws.com:amr": "authenticated"
      }
    })
  });

  const unauthenticatedRole = new iam.Role(accountStack, `${acceleratorPrefix}OpenSearchSiemIdentityUnauthRole`, {
    assumedBy: new iam.WebIdentityPrincipal('cognito-identity.amazonaws.com', {
      "StringEquals": {
        "cognito-identity.amazonaws.com:aud": cognitoIdentityPool.id
      },
      "ForAnyValue:StringLike": {
        "cognito-identity.amazonaws.com:amr": "unauthenticated"
      }
    })
  });

  const cognitoRoleForOpenSearch = new iam.Role(accountStack, `${acceleratorPrefix}OpenSearchSiemRoleForCognito`, {
    assumedBy: new iam.ServicePrincipal('es.amazonaws.com'),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonOpenSearchServiceCognitoAccess')
    ]
  });

  new CognitoIdentityPoolRoleMapping(accountStack, `${acceleratorPrefix}OpenSearchSiemRoleMapping`, {
    identityPool: cognitoIdentityPool,
    authenticatedRole: authenticatedRole,
    unauthenticatedRole: unauthenticatedRole
  });

  new CognitoUserPoolDomain(accountStack, `${acceleratorPrefix}OpenSearchCognitoDomain`, {
    domainPrefix: openSearchSIEMDeploymentConfig['cognito-domain-prefix'],
    userPool: cognitoUserPool
  });


  const domainName = `${acceleratorPrefix}-siem`.toLowerCase(); // [a-z][a-z0-9\-]+
  const domain = new OpenSearchDomain(accountStack, `OpenSearchSiemDomain${accountKey}`, {
    domainName: domainName,
    subnetIds: domainSubnetIds,
    securityGroupIds: securityGroupIds,
    mainNodeCount: openSearchSIEMDeploymentConfig['opensearch-capacity-main-nodes'],
    dataNodeCount: openSearchSIEMDeploymentConfig['opensearch-capacity-data-nodes'],
    mainNodeInstanceType: openSearchSIEMDeploymentConfig['opensearch-instance-type-main-nodes'],
    dataNodeInstanceType: openSearchSIEMDeploymentConfig['opensearch-instance-type-data-nodes'],
    volumeSize: openSearchSIEMDeploymentConfig['opensearch-volume-size'],
    encryptionKeyId: accountEbsEncryptionKeyId,
    adminRole: adminRole,
    cognitoIdentityPoolId: cognitoIdentityPool.id,
    cognitoUserPoolId: cognitoUserPool.id,
    cognitoPermissionRoleForOpenSearchArn: cognitoRoleForOpenSearch.roleArn
  });

  authenticatedRole.addToPrincipalPolicy(new iam.PolicyStatement({
    actions: [
      'es:*'
    ],
    resources: [`${domain.arn}/*`]
  }));

  
  const openSearchConfigure = new OpenSearchSiemConfigure(accountStack, `${acceleratorPrefix}OpenSearchConfigure`, {
    openSearchDomain: domain.dns,
    adminRoleMappingArn: authenticatedRole.roleArn,
    adminOpenSearchRoleArn: adminRole,
    openSearchConfigurationS3Bucket: centralConfigBucketName,
    openSearchConfigurationS3Key: openSearchSIEMDeploymentConfig['opensearch-configuration'],
    lambdaExecutionRole: lambdaRole.roleArn,
    vpc: vpc.id,
    availablityZones: azs,
    domainSubnetIds: domainSubnetIds,
    securityGroupIds: securityGroupIds,
    stsDns: stsHostedZoneDnsEntries
  });

  openSearchConfigure.node.addDependency(domain);
  
  new CfnOpenSearchClusterDnsOutput(accountStack, 'OpenSearchSIEMDomainEndpoint', {
    clusterDNS: domain.dns
  });

  
}
