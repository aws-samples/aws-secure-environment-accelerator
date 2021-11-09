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
import { OpenSearchDomain } from '@aws-accelerator/cdk-constructs/src/database';
import { CognitoIdentityPoolRoleMapping, CognitoIdentityPool, CognitoUserPool, CognitoUserPoolDomain } from '@aws-accelerator/cdk-constructs/src/cognito';
import { Vpc } from '@aws-accelerator/cdk-constructs/src/vpc';
import { AcceleratorConfig, OpenSearchSIEMConfig } from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { AcceleratorStack } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-stack';
import { SecurityGroup } from '../../common/security-group';
import { StructuredOutput } from '../../common/structured-output';
import { CfnOpenSearchClusterDnsOutput, CfnOpenSearchSiemLambdaArnOutput, OpenSearchLambdaProcessingRoleOutput, OpenSearchClusterDNSOutput } from './outputs';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { Context } from '../../utils/context';
import { EbsKmsOutput } from '@aws-accelerator/common-outputs/src/ebs';
import { IamRoleNameOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { CentralBucketOutputFinder } from '@aws-accelerator/common-outputs/src/central-bucket';
import { OpenSearchSiemConfigure } from '@aws-accelerator/custom-resource-opensearch-siem-configure';
import { HostedZoneOutputFinder } from '@aws-accelerator/common-outputs/src/hosted-zone';

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

    const openSearchClusters = StructuredOutput.fromOutputs(outputs, {
      accountKey,
      type: OpenSearchClusterDNSOutput,
    });
    const openSearchClusterExists = openSearchClusters.length == 1;

    console.log(`OpenSearchSiem-Step1: ${openSearchClusterExists}`);

    const openSearchSIEMDeploymentConfig = accountConfig.deployments?.siem;
    if (!openSearchClusterExists && (!openSearchSIEMDeploymentConfig || !openSearchSIEMDeploymentConfig.deploy)) {
      //If cluster doesn't exist, based on data in output, and the SIEM section has been removed or marked deployed false
      //continue. ie, this would remove aws resources from the stack.
      continue;
    }

    if (openSearchSIEMDeploymentConfig == undefined) {
      console.warn(`Could not find the SIEM configuration`);
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
    const stsHostedZoneDnsEntries = hostedZoneOutputs.filter(hzo =>  hzo.serviceName === 'sts').map(hostedZone => hostedZone.aliasTargetDns);
    const stsDnsEntries: string[] = [`sts.amazonaws.com`, `sts.${accountStack.region}.amazonaws.com`];
    for (const dnsEntry of stsHostedZoneDnsEntries) {
      if (dnsEntry) {
        stsDnsEntries.push(dnsEntry);
      }
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
    
    const domain = createOpenSearchCluster(
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
      stsDnsEntries,
    );

    
    const lambdaProcessingFile = openSearchSIEMDeploymentConfig['event-processor-lambda-package'];
    createProcessingLambda(
      vpc,
      [...azs],
      domainSubnetIds,
      securityGroup,
      accountStack,
      context.acceleratorPrefix,      
      processingTimeout,
      lambdaRole,
      centralBucketOutput.bucketName,
      lambdaProcessingFile,
      domain.dns,
      logArchiveStack.accountId,
      [aesLogArchiveBucket, logArchiveBucket]
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
  processingTimeout: number,
  lambdaRole: iam.IRole,
  centralConfigBucketName: string,
  lambdaProcessingFile: string,
  osDomain: string,
  logArchiveAccountId: string,
  logBuckets: s3.IBucket[]
) {
    
  const cdkVpc = ec2.Vpc.fromVpcAttributes(accountStack, 'OpenSearchVPCLookupAttr', {
    vpcId: vpc.id,
    availabilityZones: [...azs],
    privateSubnetIds: domainSubnetIds
  });

  const vpc_sg = [];
  for (const sg of securityGroup.securityGroups) {
    const tmp = ec2.SecurityGroup.fromSecurityGroupId(accountStack, `OpenSearchVPCLookup-${sg.name}`, sg.id);
    vpc_sg.push(tmp);
  }

  const configBucket = s3.Bucket.fromBucketName(accountStack, 'ConfigBucket', centralConfigBucketName);

  const eventProcessingLambda = new lambda.Function(accountStack, `${acceleratorPrefix}OpenSearchSiemProcessEvents`, {
    runtime: lambda.Runtime.PYTHON_3_8,
    code: lambda.Code.fromBucket(configBucket, lambdaProcessingFile),
    role: lambdaRole,
    handler: 'index.lambda_handler',
    timeout: cdk.Duration.seconds(processingTimeout),
    vpc: cdkVpc,
    memorySize: 2048,
    vpcSubnets: {
      subnetFilters: [ec2.SubnetFilter.byIds(domainSubnetIds)],
    },
    securityGroups: vpc_sg,
    environment: {      
        'LOG_LEVEL': 'info',
        'POWERTOOLS_LOGGER_LOG_EVENT': 'false',
        'POWERTOOLS_SERVICE_NAME': 'os-loader',
        'POWERTOOLS_METRICS_NAMESPACE': 'SIEM',
        'ES_ENDPOINT': osDomain
    },
  });

  for (const logBucket of logBuckets) {
    eventProcessingLambda.addPermission(`AllowS3Invoke-${logBucket.bucketName}`, {
      principal: new iam.ServicePrincipal('s3.amazonaws.com'),
      sourceArn: logBucket.bucketArn,
      sourceAccount: logArchiveAccountId
    });
  }

  
  new CfnOpenSearchSiemLambdaArnOutput(accountStack, 'OpenSearchSiemProcessingLambdaArn', {
    lambdaArn: eventProcessingLambda.functionArn
  });

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
  lambdaRole: iam.IRole,
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


  const domainName = `${acceleratorPrefix}siem`.toLowerCase(); // [a-z][a-z0-9\-]+
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
    osProcesserRoleArn: lambdaRole.roleArn,
    openSearchConfigurationS3Bucket: centralConfigBucketName,
    openSearchConfigurationS3Key: openSearchSIEMDeploymentConfig['opensearch-configuration'],
    lambdaExecutionRole: lambdaRole.roleArn,
    vpcId: vpc.id,
    availablityZones: azs,
    domainSubnetIds: domainSubnetIds,
    securityGroupIds: securityGroupIds,
    stsDns: stsHostedZoneDnsEntries
  });

  openSearchConfigure.node.addDependency(domain);
  
  new CfnOpenSearchClusterDnsOutput(accountStack, 'OpenSearchSIEMDomainEndpoint', {
    clusterDNS: domain.dns
  });

  return domain;
}
