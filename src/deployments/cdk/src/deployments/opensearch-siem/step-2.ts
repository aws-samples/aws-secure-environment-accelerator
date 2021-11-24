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
import * as iam from '@aws-cdk/aws-iam';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as lambda from '@aws-cdk/aws-lambda';
import * as events from '@aws-cdk/aws-events';
import * as eventTargets from '@aws-cdk/aws-events-targets';

import { OpenSearchDomain } from '@aws-accelerator/cdk-constructs/src/database';
import {
  CognitoIdentityPoolRoleMapping,
  CognitoIdentityPool,
  CognitoUserPool,
  CognitoUserPoolDomain,
} from '@aws-accelerator/cdk-constructs/src/cognito';
import { Vpc } from '@aws-accelerator/cdk-constructs/src/vpc';
import { AcceleratorConfig, OpenSearchSIEMConfig } from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { AcceleratorStack } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-stack';
import { SecurityGroup } from '../../common/security-group';
import { StructuredOutput } from '../../common/structured-output';
import {
  CfnOpenSearchClusterDnsOutput,
  CfnOpenSearchSiemLambdaArnOutput,
  OpenSearchLambdaProcessingRoleOutput,
  OpenSearchClusterDNSOutput,
} from './outputs';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { Context } from '../../utils/context';
import { EbsKmsOutput } from '@aws-accelerator/common-outputs/src/ebs';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { CentralBucketOutputFinder } from '@aws-accelerator/common-outputs/src/central-bucket';
import { OpenSearchSiemConfigure } from '@aws-accelerator/custom-resource-opensearch-siem-configure';
import { OpenSearchSiemGeoIpInit } from '@aws-accelerator/custom-resource-opensearch-siem-geoip-init';

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
  const {
    accountStacks,
    config,
    outputs,
    vpcs,
    logArchiveBucket,
    context,
    aesLogArchiveBucket,
    processingTimeout = 900,
  } = props;

  for (const [accountKey, accountConfig] of config.getMandatoryAccountConfigs()) {
    const openSearchClusters = StructuredOutput.fromOutputs(outputs, {
      accountKey,
      type: OpenSearchClusterDNSOutput,
    });
    const openSearchClusterExists = openSearchClusters.length === 1;

    console.log(`OpenSearchSiem-Step1: ${openSearchClusterExists}`);

    const openSearchSIEMDeploymentConfig = accountConfig.deployments?.siem;
    if (!openSearchSIEMDeploymentConfig || !openSearchSIEMDeploymentConfig.deploy) {
      // If cluster doesn't exist, based on data in output, and the SIEM section has been removed or marked deployed false
      // continue. ie, this would remove aws resources from the stack.
      continue;
    }

    if (openSearchSIEMDeploymentConfig === undefined) {
      console.warn(`Could not find the SIEM configuration`);
      continue;
    }

    const vpc = vpcs.find(v => v.name === openSearchSIEMDeploymentConfig['vpc-name']);
    if (!vpc) {
      console.log(
        `Skipping OpenSearch deployment because of missing VPC "${openSearchSIEMDeploymentConfig['vpc-name']}"`,
      );
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

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
        console.warn(
          `Cannot find app subnet with name "${subnetConfig.name}" in availability zone "${subnetConfig.az}"`,
        );
        continue;
      }
      domainSubnetIds.push(subnet.id);
    }

    if (domainSubnetIds.length === 0) {
      console.log(
        `Skipping OpenSearch deployment because of missing app subnets "${openSearchSIEMDeploymentConfig['app-subnets']}"`,
      );
      return;
    }

    const openSearchSiemProcessingRoleOutput = StructuredOutput.fromOutputs(outputs, {
      accountKey,
      type: OpenSearchLambdaProcessingRoleOutput,
    });
    if (openSearchSiemProcessingRoleOutput.length !== 1) {
      console.warn(`Cannot find required OpenSearchSiemProcessing role in account "${accountKey}"`);
      return;
    }
    const openSearchSiemProcessingRoleArn = openSearchSiemProcessingRoleOutput[0].roleArn;

    const logGroupLambdaRoleOutput = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey,
      roleKey: 'LogGroupRole',
    });

    if (!logGroupLambdaRoleOutput) {
      console.warn(`Cannot find required LogGroupLambda role in account "${accountKey}"`);
      return;
    }

    const logAccountKey = config.getMandatoryAccountKey('central-log');
    const logArchiveStack = accountStacks.getOrCreateAccountStack(logAccountKey);

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

    const lambdaRole = iam.Role.fromRoleArn(
      accountStack,
      `${context.acceleratorPrefix}OpenSearchSiemProcessEventsLambdaRole`,
      openSearchSiemProcessingRoleArn,
      {
        mutable: true,
      },
    );

    const domain = createOpenSearchCluster(
      accountKey,
      openSearchSIEMDeploymentConfig,
      accountStack,
      context.acceleratorPrefix,
      accountEbsEncryptionKeyId,
      logGroupLambdaRoleOutput.roleArn,
      domainSubnetIds,
      [securityGroupId],
      vpc,
      [...azs],
      lambdaRole,
      centralBucketOutput.bucketName,
    );

    const configBucket = s3.Bucket.fromBucketName(accountStack, 'ConfigBucket', centralBucketOutput.bucketName);
    const cdkVpc = ec2.Vpc.fromVpcAttributes(accountStack, 'OpenSearchVPCLookupAttr', {
      vpcId: vpc.id,
      availabilityZones: [...azs],
      privateSubnetIds: domainSubnetIds,
    });

    const vpcSecurityGroups: ec2.ISecurityGroup[] = [];
    for (const sg of securityGroup.securityGroups) {
      const tmp = ec2.SecurityGroup.fromSecurityGroupId(accountStack, `OpenSearchVPCLookup-${sg.name}`, sg.id);
      vpcSecurityGroups.push(tmp);
    }

    const maxMindLicense = openSearchSIEMDeploymentConfig['maxmind-license'];
    let geoUploadBucket: s3.IBucket | undefined;
    if (maxMindLicense) {
      geoUploadBucket = new s3.Bucket(accountStack, `${context.acceleratorPrefix}OpenSearchSiem`, {
        encryption: s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        enforceSSL: true,
      });

      geoUploadBucket.addToResourcePolicy(
        new iam.PolicyStatement({
          actions: ['s3:GetObject*'],
          resources: [geoUploadBucket.arnForObjects('*')],
          principals: [lambdaRole],
        }),
      );

      createGeoIpDownloader(
        cdkVpc,
        domainSubnetIds,
        vpcSecurityGroups,
        accountStack,
        context.acceleratorPrefix,
        configBucket,
        maxMindLicense,
        geoUploadBucket,
      );
    }

    const lambdaProcessingFile = openSearchSIEMDeploymentConfig['event-processor-lambda-package'];
    createProcessingLambda(
      cdkVpc,
      domainSubnetIds,
      vpcSecurityGroups,
      accountStack,
      context.acceleratorPrefix,
      processingTimeout,
      lambdaRole,
      configBucket,
      lambdaProcessingFile,
      domain.dns,
      logArchiveStack.accountId,
      [aesLogArchiveBucket, logArchiveBucket],
      geoUploadBucket,
    );
  }
}

export function createGeoIpDownloader(
  vpc: ec2.IVpc,
  domainSubnetIds: string[],
  vpcSecurityGroups: ec2.ISecurityGroup[],
  accountStack: AcceleratorStack,
  acceleratorPrefix: string,
  configBucket: s3.IBucket,
  licenseFile: string,
  geoUploadBucket: s3.IBucket,
) {
  const lambdaPath = require.resolve('@aws-accelerator/deployments-runtime');
  const lambdaDir = path.dirname(lambdaPath);
  const lambdaCode = lambda.Code.fromAsset(lambdaDir);

  const lambdaRoleName = `${acceleratorPrefix}OpenSearchGeoIpDownloaderRole`;
  const lambdaRole = new iam.Role(accountStack, 'OpenSearchGeoIpDownloaderRole', {
    roleName: lambdaRoleName,
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess'),
    ],
  });

  lambdaRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['kms:Decrypt'],
      resources: ['*'],
    }),
  );

  geoUploadBucket.addToResourcePolicy(
    new iam.PolicyStatement({
      actions: ['s3:GetObject*', 's3:PutObject*', 's3:DeleteObject*', 's3:GetBucket*', 's3:List*'],
      resources: [geoUploadBucket.arnForObjects('*'), geoUploadBucket.bucketArn],
      principals: [lambdaRole],
    }),
  );

  const geoIpDownloader = new lambda.Function(accountStack, `${acceleratorPrefix}OpenSearchSiemGeoIpDownloaderLambda`, {
    runtime: lambda.Runtime.NODEJS_14_X,
    role: lambdaRole,
    code: lambdaCode,
    handler: 'index.geoIpDownloader',
    timeout: cdk.Duration.minutes(5),
    memorySize: 1048,
    vpc,
    vpcSubnets: {
      subnetFilters: [ec2.SubnetFilter.byIds(domainSubnetIds)],
    },
    securityGroups: vpcSecurityGroups,
    environment: {
      CONFIG_BUCKET: configBucket.bucketName,
      LICENSE: licenseFile,
      UPLOAD_BUCKET: geoUploadBucket.bucketName,
      S3KEY_PREFIX: 'GeoLite2/',
    },
  });

  const dailyRule = new events.Rule(accountStack, 'OpenSearchGeoIpDailyDownload', {
    ruleName: `${acceleratorPrefix}OpenSearchSiem-GeoIp-DailyDownload`,
    schedule: events.Schedule.rate(cdk.Duration.hours(12)),
  });

  dailyRule.addTarget(new eventTargets.LambdaFunction(geoIpDownloader));

  new OpenSearchSiemGeoIpInit(accountStack, `${acceleratorPrefix}OpenSearchSiemGeoIpInitLambda`, {
    geoIpLambdaRoleArn: geoIpDownloader.functionArn,
  });
}

export function createProcessingLambda(
  vpc: ec2.IVpc,
  domainSubnetIds: string[],
  vpcSecurityGroups: ec2.ISecurityGroup[],
  accountStack: AcceleratorStack,
  acceleratorPrefix: string,
  processingTimeout: number,
  lambdaRole: iam.IRole,
  configBucket: s3.IBucket,
  lambdaProcessingFile: string,
  osDomain: string,
  logArchiveAccountId: string,
  logBuckets: s3.IBucket[],
  geoIpUploadBucket?: s3.IBucket,
) {
  const eventProcessingLambda = new lambda.Function(accountStack, `${acceleratorPrefix}OpenSearchSiemProcessEvents`, {
    runtime: lambda.Runtime.PYTHON_3_8,
    code: lambda.Code.fromBucket(configBucket, lambdaProcessingFile),
    role: lambdaRole,
    handler: 'index.lambda_handler',
    timeout: cdk.Duration.seconds(processingTimeout),
    vpc,
    memorySize: 2048,
    vpcSubnets: {
      subnetFilters: [ec2.SubnetFilter.byIds(domainSubnetIds)],
    },
    securityGroups: vpcSecurityGroups,
    environment: {
      LOG_LEVEL: 'info',
      POWERTOOLS_LOGGER_LOG_EVENT: 'false',
      POWERTOOLS_SERVICE_NAME: 'os-loader',
      POWERTOOLS_METRICS_NAMESPACE: 'SIEM',
      ES_ENDPOINT: osDomain,
      GEOIP_BUCKET: geoIpUploadBucket?.bucketName || '',
    },
  });

  for (const logBucket of logBuckets) {
    eventProcessingLambda.addPermission(`AllowS3Invoke-${logBucket.bucketName}`, {
      principal: new iam.ServicePrincipal('s3.amazonaws.com'),
      sourceArn: logBucket.bucketArn,
      sourceAccount: logArchiveAccountId,
    });
  }

  new CfnOpenSearchSiemLambdaArnOutput(accountStack, 'OpenSearchSiemProcessingLambdaArn', {
    lambdaArn: eventProcessingLambda.functionArn,
  });
}

export function createOpenSearchCluster(
  accountKey: string,
  openSearchSIEMDeploymentConfig: OpenSearchSIEMConfig,
  accountStack: AcceleratorStack,
  acceleratorPrefix: string,
  accountEbsEncryptionKeyId: string,
  logGroupLambdaRoleArn: string,
  domainSubnetIds: string[],
  securityGroupIds: string[],
  vpc: Vpc,
  azs: string[],
  lambdaRole: iam.IRole,
  centralConfigBucketName: string,
) {
  const cognitoUserPool = new CognitoUserPool(accountStack, `${acceleratorPrefix}OpenSearchSiemUserPool`, {
    userPoolName: 'OpenSearchSiemUserPool',
    usernameAttributes: ['email'],
  });

  const cognitoIdentityPool = new CognitoIdentityPool(accountStack, `${acceleratorPrefix}OpenSearchSiemIdenittyPool`, {
    identityPoolName: 'OpenSearchSiemIdentityPool',
    allowUnauthenticatedIdentities: false,
  });

  const authenticatedRole = new iam.Role(accountStack, `${acceleratorPrefix}OpenSearchSiemIdentityAuthRole`, {
    assumedBy: new iam.WebIdentityPrincipal('cognito-identity.amazonaws.com', {
      StringEquals: {
        'cognito-identity.amazonaws.com:aud': cognitoIdentityPool.id,
      },
      'ForAnyValue:StringLike': {
        'cognito-identity.amazonaws.com:amr': 'authenticated',
      },
    }),
  });

  const cognitoRoleForOpenSearch = new iam.Role(accountStack, `${acceleratorPrefix}OpenSearchSiemRoleForCognito`, {
    assumedBy: new iam.ServicePrincipal('es.amazonaws.com'),
    managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonOpenSearchServiceCognitoAccess')],
  });

  new CognitoIdentityPoolRoleMapping(accountStack, `${acceleratorPrefix}OpenSearchSiemRoleMapping`, {
    identityPool: cognitoIdentityPool,
    authenticatedRole,
  });

  new CognitoUserPoolDomain(accountStack, `${acceleratorPrefix}OpenSearchCognitoDomain`, {
    domainPrefix: openSearchSIEMDeploymentConfig['cognito-domain-prefix'],
    userPool: cognitoUserPool,
  });

  const domainName = `${acceleratorPrefix}siem`.toLowerCase(); // [a-z][a-z0-9\-]+
  const domain = new OpenSearchDomain(accountStack, `OpenSearchSiemDomain${accountKey}`, {
    acceleratorPrefix,
    domainName,
    subnetIds: domainSubnetIds,
    securityGroupIds,
    mainNodeCount: openSearchSIEMDeploymentConfig['opensearch-capacity-main-nodes'],
    dataNodeCount: openSearchSIEMDeploymentConfig['opensearch-capacity-data-nodes'],
    mainNodeInstanceType: openSearchSIEMDeploymentConfig['opensearch-instance-type-main-nodes'],
    dataNodeInstanceType: openSearchSIEMDeploymentConfig['opensearch-instance-type-data-nodes'],
    volumeSize: openSearchSIEMDeploymentConfig['opensearch-volume-size'],
    encryptionKeyId: accountEbsEncryptionKeyId,
    adminRoleArn: lambdaRole.roleArn,
    logGroupLambdaRoleArn,
    cognitoIdentityPoolId: cognitoIdentityPool.id,
    cognitoUserPoolId: cognitoUserPool.id,
    cognitoPermissionRoleForOpenSearchArn: cognitoRoleForOpenSearch.roleArn,
  });

  authenticatedRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['es:*'],
      resources: [`${domain.arn}/*`],
    }),
  );

  const openSearchConfigure = new OpenSearchSiemConfigure(accountStack, `${acceleratorPrefix}OpenSearchConfigure`, {
    openSearchDomain: domain.dns,
    adminRoleMappingArn: authenticatedRole.roleArn,
    osProcesserRoleArn: lambdaRole.roleArn,
    openSearchConfigurationS3Bucket: centralConfigBucketName,
    openSearchConfigurationS3Key: openSearchSIEMDeploymentConfig['opensearch-configuration'],
    lambdaExecutionRole: lambdaRole.roleArn,
    vpcId: vpc.id,
    availablityZones: azs,
    domainSubnetIds,
    securityGroupIds,
  });

  openSearchConfigure.node.addDependency(domain);

  new CfnOpenSearchClusterDnsOutput(accountStack, 'OpenSearchSIEMDomainEndpoint', {
    clusterDNS: domain.dns,
  });

  return domain;
}
