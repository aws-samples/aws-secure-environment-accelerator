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

import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3Deployment from 'aws-cdk-lib/aws-s3-deployment';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { SnsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventTargets from 'aws-cdk-lib/aws-events-targets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cognito from './siem-cognito';
import { SiemConfig } from './siem-config';
import * as opensearch from './open-search';
import { OpenSearchSiemConfigure } from './siem-configure';
import { OpenSearchSiemGeoIpInit } from './siem-geoip-download';
import { Alerts } from './siem-alerts';

export interface OpenSearchSiemStackProps extends StackProps {
  provisionServiceLinkedRole?: boolean;
  siemConfig: SiemConfig;
}
export class OpenSearchSiemStack extends Stack {
  constructor(scope: Construct, id: string, props: OpenSearchSiemStackProps) {
    super(scope, id, props);

    const { provisionServiceLinkedRole = true, siemConfig } = props;

    let osServiceLinkedRoleArn = null;
    if (provisionServiceLinkedRole) {
      const serviceLinkedRole = new iam.CfnServiceLinkedRole(this, 'OpenSearchServiceLinkedRole', {
        awsServiceName: 'es.amazonaws.com',
      });

      osServiceLinkedRoleArn = `arn:aws:iam::${this.account}:role/aws-service-role/${serviceLinkedRole.awsServiceName}/${serviceLinkedRole.ref}`;
    } else {
      osServiceLinkedRoleArn = `arn:aws:iam::${this.account}:role/aws-service-role/es.amazonaws.com/AWSServiceRoleForAmazonElasticsearchService`;
    }

    const kmsEncryptionKey = new kms.Key(this, 'EncryptionKey', {
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    new kms.Alias(this, 'EncryptionKeyAlias', {
      aliasName: 'opensearch-siem',
      targetKey: kmsEncryptionKey,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    if (osServiceLinkedRoleArn) {
      kmsEncryptionKey.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'Allow OS service-linked role use of the CMK',
          principals: [new iam.ArnPrincipal(osServiceLinkedRoleArn)],
          actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
          resources: ['*'],
        }),
      );

      kmsEncryptionKey.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'Allow OS attachment of persistent resources',
          effect: iam.Effect.ALLOW,
          principals: [new iam.ArnPrincipal(osServiceLinkedRoleArn)],
          actions: ['kms:CreateGrant'],
          resources: ['*'],
          conditions: {
            Bool: {
              'kms:GrantIsForAWSResource': 'true',
            },
          },
        }),
      );
    }

    const adminOpenSearchRole = new iam.Role(this, `AdminRole`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonOpenSearchServiceFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    });

    // TODO lambda processing role permissions

    const vpc = ec2.Vpc.fromLookup(this, 'VPCLookup', {
      vpcId: siemConfig.vpcId,
    });

    const securityGroups: ec2.SecurityGroup[] = [];
    // Create Security Group
    for (const sg of siemConfig.securityGroups) {
      const securityGroup = new ec2.SecurityGroup(this, sg.name, {
        vpc,
        securityGroupName: sg.name,
      });
      for (const iRule of sg.inboundRules) {
        const ruleDesc = iRule.description;

        for (const src of iRule.source) {
          if (iRule.tcpPorts) {
            for (const tcpPort of iRule.tcpPorts) {
              securityGroup.addIngressRule(ec2.Peer.ipv4(src), ec2.Port.tcp(tcpPort), ruleDesc);
            }
          }
        }
      }

      for (const oRule of sg.outboundRules) {
        const ruleDesc = oRule.description;

        for (const src of oRule.source) {
          if (oRule.tcpPorts) {
            for (const tcpPort of oRule.tcpPorts) {
              securityGroup.addEgressRule(ec2.Peer.ipv4(src), ec2.Port.tcp(tcpPort));
            }
          } else if (oRule.type && oRule.type.length > 0 && oRule.type[0] === 'ALL') {
            securityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.allTraffic(), ruleDesc);
          }
        }
      }

      securityGroups.push(securityGroup);
    }

    // Cognito
    const cognitoUserPool = new cognito.CognitoUserPool(this, `UserPool`, {
      userPoolName: 'OpenSearchSiemUserPool',
      usernameAttributes: ['email'],
    });

    const cognitoIdentityPool = new cognito.CognitoIdentityPool(this, `IdenittyPool`, {
      identityPoolName: 'OpenSearchSiemIdentityPool',
      allowUnauthenticatedIdentities: false,
    });

    const authenticatedRole = new iam.Role(this, `IdentityAuthRole`, {
      assumedBy: new iam.WebIdentityPrincipal('cognito-identity.amazonaws.com', {
        StringEquals: {
          'cognito-identity.amazonaws.com:aud': cognitoIdentityPool.id,
        },
        'ForAnyValue:StringLike': {
          'cognito-identity.amazonaws.com:amr': 'authenticated',
        },
      }),
    });

    const cognitoRoleForOpenSearch = new iam.Role(this, `RoleForCognito`, {
      assumedBy: new iam.ServicePrincipal('es.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonOpenSearchServiceCognitoAccess')],
    });

    new cognito.CognitoIdentityPoolRoleMapping(this, `RoleMapping`, {
      identityPool: cognitoIdentityPool,
      authenticatedRole,
    });

    new cognito.CognitoUserPoolDomain(this, `CognitoDomain`, {
      domainPrefix: siemConfig.cognitoDomainPrefix,
      userPool: cognitoUserPool,
    });

    const securityGroupIds = securityGroups.map(x => x.securityGroupId);

    const domain = new opensearch.OpenSearchDomain(this, `Domain`, {
      domainName: siemConfig.openSearchDomainName,
      subnetIds: siemConfig.appSubnets,
      securityGroupIds,
      mainNodeCount: siemConfig.openSearchCapacityMainNodes,
      dataNodeCount: siemConfig.openSearchCapacityDataNodes,
      mainNodeInstanceType: siemConfig.openSearchInstanceTypeMainNodes,
      dataNodeInstanceType: siemConfig.openSearchInstanceTypeDataNodes,
      volumeSize: siemConfig.openSearchVolumeSize,
      encryptionKeyId: kmsEncryptionKey.keyId,
      adminRoleArn: adminOpenSearchRole.roleArn,
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

    const siemBucket = new s3.Bucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      enforceSSL: true,
      encryptionKey: kmsEncryptionKey,
    });

    siemBucket.grantReadWrite(adminOpenSearchRole);

    const fileUpload = new s3Deployment.BucketDeployment(this, 'ConfigUpload', {
      sources: [s3Deployment.Source.asset('config')],
      destinationBucket: siemBucket,
      retainOnDelete: false,
    });

    const siemConfigure = new OpenSearchSiemConfigure(this, 'Configure', {
      openSearchDomain: domain.dns,
      adminRoleMappingArn: authenticatedRole.roleArn,
      osProcesserRoleArn: siemConfig.lambdaLogProcessingRoleArn,
      openSearchConfigurationS3Bucket: siemBucket.bucketName,
      openSearchConfigurationS3Key: siemConfig.openSearchConfiguration,
      lambdaExecutionRole: adminOpenSearchRole.roleArn,
      vpcId: siemConfig.vpcId,
      domainSubnetIds: siemConfig.appSubnets,
      securityGroupIds,
      siemVersion: siemConfig.siemVersion,
    });

    siemConfigure.node.addDependency(fileUpload);

    this.configureGeoIpDownloader(
      this,
      siemBucket,
      vpc,
      siemConfig.appSubnets,
      securityGroups,
      siemConfig.siemVersion,
      siemConfig.maxmindLicense,
    );

    this.configureSiemProcessor(
      this,
      vpc,
      siemConfig.appSubnets,
      securityGroups,
      siemConfig.lambdaLogProcessingRoleArn,
      domain.dns,
      siemConfig.logArchiveAccountId,
      siemConfig.s3LogBuckets,
      siemConfig.siemVersion,
      siemConfig.enableLambdaSubscription,
      siemConfig.enableLambdaInsights,
      siemConfig.s3NotificationTopicNameOrExistingArn,
      siemBucket,
    );

    this.configureSnsAlerts(this, kmsEncryptionKey, domain.name, siemConfig.alertNotificationEmails);
  }

  configureSnsAlerts(scope: Construct, kmsKey: kms.Key, clusterDomainName: string, alertEmails: string[]) {
    const snsAlertRole = new iam.Role(scope, 'SnsAlertRole', {
      roleName: 'opensearch-siem-sns-role',
      assumedBy: new iam.ServicePrincipal('es.amazonaws.com'),
    });

    const snsAlertTopic = new sns.Topic(scope, 'SnsAlertTopic', {
      topicName: 'opensearch-siem-sns-alerts',
      displayName: 'OpenSearch SIEM Alert Topic',
      masterKey: kmsKey,
    });

    if (alertEmails && alertEmails.length > 0) {
      for (const email of alertEmails) {
        snsAlertTopic.addSubscription(new snsSubscriptions.EmailSubscription(email));
      }
    }

    snsAlertTopic.grantPublish(snsAlertRole);

    new Alerts(scope, 'opensearch-siem-alerts', {
      alertTopic: snsAlertTopic,
      clusterDomainName,
    });
  }

  configureSiemProcessor(
    scope: Construct,
    vpc: ec2.IVpc,
    domainSubnetIds: string[],
    securityGroups: ec2.SecurityGroup[],
    lambdaProcessingRoleArn: string,
    osDomain: string,
    logArchiveAccountId: string,
    s3LogBuckets: string[],
    siemVersion: string,
    enableTopicSubscription: boolean,
    enableLambdaInsights: boolean,
    s3NotificationTopicNameOrExistingArn: string,
    geoIpUploadBucket?: s3.Bucket,
  ) {
    const lambdaRole = iam.Role.fromRoleArn(scope, 'LambdaProcessorRole', lambdaProcessingRoleArn);

    const eventProcessingLambda = new lambda.Function(scope, 'SiemProcessor', {
      runtime: lambda.Runtime.PYTHON_3_8,
      code: lambda.Code.fromAsset('lambdas/siem-processor/os-loader.zip'),
      role: lambdaRole,
      handler: 'index.lambda_handler',
      timeout: Duration.minutes(2),
      vpc,
      memorySize: 512,
      vpcSubnets: {
        subnetFilters: [ec2.SubnetFilter.byIds(domainSubnetIds)],
      },
      securityGroups,
      environment: {
        LOG_LEVEL: 'info',
        POWERTOOLS_LOGGER_LOG_EVENT: 'false',
        POWERTOOLS_SERVICE_NAME: 'os-loader',
        POWERTOOLS_METRICS_NAMESPACE: 'SIEM',
        ES_ENDPOINT: osDomain,
        GEOIP_BUCKET: geoIpUploadBucket?.bucketName || '',
        SIEM_VERSION: siemVersion,
      },
      insightsVersion: enableLambdaInsights ? lambda.LambdaInsightsVersion.VERSION_1_0_135_0 : undefined,
    });

    for (const logBucket of s3LogBuckets) {
      eventProcessingLambda.addPermission(`AllowS3Invoke-${logBucket}`, {
        principal: new iam.ServicePrincipal('s3.amazonaws.com'),
        sourceArn: `arn:aws:s3:::${logBucket}`,
        sourceAccount: logArchiveAccountId,
      });
    }

    if (enableTopicSubscription) {
      let topicSourceArn = s3NotificationTopicNameOrExistingArn;

      if (!s3NotificationTopicNameOrExistingArn.startsWith('arn')) {
        topicSourceArn = `arn:aws:sns:${this.region}:${logArchiveAccountId}:${s3NotificationTopicNameOrExistingArn}`;
      }

      const snsTopic = sns.Topic.fromTopicArn(this, 's3NotificationTopicLookup', topicSourceArn);
      eventProcessingLambda.addEventSource(new SnsEventSource(snsTopic));
    }

    // Dead Letter Queue
    const dql = new sqs.Queue(scope, 'DLQ', {
      queueName: 'opensearch-siem-dlq',
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    const cfnLambda = eventProcessingLambda.node.defaultChild as lambda.CfnFunction;

    cfnLambda.deadLetterConfig = {
      targetArn: dql.queueArn,
    };

    new CfnOutput(scope, 'LambdaProcessorArn', {
      value: eventProcessingLambda.functionArn,
    });
  }

  configureGeoIpDownloader(
    scope: Construct,
    bucket: s3.Bucket,
    vpc: ec2.IVpc,
    domainSubnetIds: string[],
    securityGroups: ec2.SecurityGroup[],
    siemVersion: string,
    licenseFile?: string,
  ) {
    if (licenseFile) {
      const lambdaRole = new iam.Role(scope, 'GeoIpDownloaderRole', {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole')],
      });

      bucket.grantReadWrite(lambdaRole);

      lambdaRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['kms:Decrypt'],
          resources: ['*'],
        }),
      );

      bucket.addToResourcePolicy(
        new iam.PolicyStatement({
          actions: ['s3:GetObject*', 's3:PutObject*', 's3:DeleteObject*', 's3:GetBucket*', 's3:List*'],
          resources: [bucket.arnForObjects('*'), bucket.bucketArn],
          principals: [lambdaRole],
        }),
      );

      const geoIpDownloader = new lambda.Function(scope, 'GeoIpDownloaderLambda', {
        runtime: lambda.Runtime.NODEJS_18_X,
        role: lambdaRole,
        code: lambda.Code.fromAsset('lambdas/siem-geoip/dist'),
        handler: 'index.geoIpDownloader',
        timeout: Duration.minutes(5),
        memorySize: 1048,
        vpc,
        vpcSubnets: {
          subnetFilters: [ec2.SubnetFilter.byIds(domainSubnetIds)],
        },
        securityGroups,
        environment: {
          CONFIG_BUCKET: bucket.bucketName,
          LICENSE: licenseFile,
          UPLOAD_BUCKET: bucket.bucketName,
          S3KEY_PREFIX: 'GeoLite2/',
        },
      });

      const dailyRule = new events.Rule(scope, 'GeoIpDailyDownload', {
        ruleName: 'OpenSearchSiem-GeoIp-DailyDownload',
        schedule: events.Schedule.rate(Duration.hours(12)),
      });

      dailyRule.addTarget(new eventTargets.LambdaFunction(geoIpDownloader));

      new OpenSearchSiemGeoIpInit(scope, 'GeoIpInit', {
        geoIpLambdaRoleArn: geoIpDownloader.functionArn,
        siemVersion,
      });
    }
  }
}
