import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import * as kms from '@aws-cdk/aws-kms';
import { AccountConfig } from '@aws-pbmm/common-lambda/lib/config';
import { InterfaceEndpoints } from '../common/interface-endpoints';
import { Vpc } from '../common/vpc';
import { FlowLogs } from '../common/flow-logs';
import { TransitGateway } from '../common/transit-gateway';
import { TransitGatewayAttachment, TransitGatewayAttachmentProps } from '../common/transit-gateway-attachment';
import { AcceleratorStack, AcceleratorStackProps } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';

export namespace SharedNetwork {
  export interface StackProps extends AcceleratorStackProps {
    accountConfig: AccountConfig;
    acceleratorExecutionRoleName: string;
    logArchiveAccountId: string;
    logArchiveS3BucketArn: string;
    logArchiveS3KmsKeyArn: string;
  }

  export class Stack extends AcceleratorStack {
    constructor(scope: cdk.Construct, id: string, props: StackProps) {
      super(scope, id, props);

      const accountProps = props.accountConfig;

      // Create VPC, Subnets, RouteTables and Routes on Shared-Network Account
      const vpcConfig = accountProps.vpc!;
      const vpc = new Vpc(this, 'vpc', {
        vpcConfig,
      });

      // Create a role that will be able to replicate to the log-archive bucket
      const replicationRole = new iam.Role(this, 'ReplicationRole', {
        roleName: 'PBMMAccelS3ReplicationRole',
        assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
      });

      // kms key used for vpc-flow-logs s3 bucket encryption
      const kmsKey = new kms.Key(this, 'kmsKeyForVpcFlowLogsS3', {
        alias: 'PBMMAccel-Key',
        description: 'Key used to encrypt PBMM Accel s3 bucket',
        enableKeyRotation: false,
        enabled: true,
      });

      // Grant access for the ReplicationRole to read and write
      kmsKey.grantEncryptDecrypt(replicationRole);

      // bucket name format: pbmmaccel-{account #}-{region}
      const flowLogBucketName = `pbmmaccel-${this.account}-${this.region}`;

      // s3 bucket to collect vpc-flow-logs
      const s3BucketForVpcFlowLogs = new s3.CfnBucket(this, 's3ForVpcFlowLogs', {
        bucketName: flowLogBucketName,
        publicAccessBlockConfiguration: {
          blockPublicAcls: true,
          blockPublicPolicy: true,
          ignorePublicAcls: true,
          restrictPublicBuckets: true,
        },
        versioningConfiguration: {
          status: 'Enabled',
        },
        bucketEncryption: {
          serverSideEncryptionConfiguration: [
            {
              serverSideEncryptionByDefault: {
                sseAlgorithm: 'aws:kms',
                kmsMasterKeyId: kmsKey.keyId,
              },
            },
          ],
        },
        lifecycleConfiguration: {
          rules: [
            {
              id: 'PBMMAccel-s3-life-cycle-policy-rule-1',
              status: 'Enabled',
              abortIncompleteMultipartUpload: {
                daysAfterInitiation: 7,
              },
              expirationInDays: vpcConfig['log-retention'],
              noncurrentVersionExpirationInDays: vpcConfig['log-retention'],
            },
          ],
        },
        replicationConfiguration: {
          role: replicationRole.roleArn,
          rules: [
            {
              id: 'PBMMAccel-s3-replication-rule-1',
              status: 'Enabled',
              prefix: '',
              sourceSelectionCriteria: {
                sseKmsEncryptedObjects: {
                  status: 'Enabled',
                },
              },
              destination: {
                bucket: props.logArchiveS3BucketArn,
                account: props.logArchiveAccountId,
                encryptionConfiguration: {
                  replicaKmsKeyId: props.logArchiveS3KmsKeyArn,
                },
                storageClass: 'STANDARD',
                accessControlTranslation: {
                  owner: 'Destination',
                },
              },
            },
          ],
        },
      });

      // Grant the replication role the actions to replicate the objects in the bucket
      replicationRole.addToPolicy(
        new iam.PolicyStatement({
          actions: [
            's3:GetObjectLegalHold',
            's3:GetObjectRetention',
            's3:GetObjectVersion',
            's3:GetObjectVersionAcl',
            's3:GetObjectVersionForReplication',
            's3:GetObjectVersionTagging',
            's3:GetReplicationConfiguration',
            's3:ListBucket',
            's3:ReplicateDelete',
            's3:ReplicateObject',
            's3:ReplicateTags',
          ],
          resources: [s3BucketForVpcFlowLogs.attrArn, `${s3BucketForVpcFlowLogs.attrArn}/*`],
        }),
      );

      // Allow the replication role to replicate objects to the log archive bucket
      replicationRole.addToPolicy(
        new iam.PolicyStatement({
          actions: [
            's3:ReplicateObject',
            's3:ReplicateDelete',
            's3:ReplicateTags',
            's3:GetObjectVersionTagging',
            's3:ObjectOwnerOverrideToBucketOwner',
          ],
          resources: [props.logArchiveS3BucketArn, `${props.logArchiveS3BucketArn}/*`],
        }),
      );

      // Allow the replication role to encrypt using the log archive KMS key
      replicationRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['kms:Encrypt'],
          resources: [props.logArchiveS3KmsKeyArn],
        }),
      );

      // Creating FlowLog for VPC
      if (vpcConfig['flow-logs']) {
        new FlowLogs(this, 'flowlog', {
          vpcId: vpc.vpcId,
          bucketArn: s3BucketForVpcFlowLogs.attrArn,
        });
      }

      // Creating TGW for Shared-Network Account
      const deployments = accountProps.deployments;
      const twgDeployment = deployments.tgw;
      const twgAttach = vpcConfig['tgw-attach'];
      if (twgDeployment) {
        const tgw = new TransitGateway(this, twgDeployment.name!, twgDeployment);
        if (twgAttach) {
          // TBD Account Check

          // TBD TGW Name Check

          // **** Attach VPC to TGW ********
          // Prepare props for TGW Attachment
          let subnetIds: string[] = [];
          const vpcTgwAttach = vpcConfig['tgw-attach']!;
          const vpcTgwAttachSubnets = vpcTgwAttach['attach-subnets']!;
          for (const subnet of vpcTgwAttachSubnets) {
            subnetIds = subnetIds.concat(vpc.azSubnets.get(subnet) as string[]);
          }

          const tgwRouteAssociations: string[] = [];
          const tgwRoutePropagates: string[] = [];
          const vpcTgwRTAssociate = vpcTgwAttach['tgw-rt-associate']!;
          for (const route of vpcTgwRTAssociate) {
            if (tgw.tgwRouteTableNameToIdMap && tgw.tgwRouteTableNameToIdMap.get(route)) {
              tgwRouteAssociations.push(tgw.tgwRouteTableNameToIdMap.get(route) as string);
            }
          }
          const vpcTgwRTPropagate = vpcTgwAttach['tgw-rt-propagate']!;
          for (const route of vpcTgwRTPropagate) {
            if (tgw.tgwRouteTableNameToIdMap && tgw.tgwRouteTableNameToIdMap.get(route)) {
              tgwRoutePropagates.push(tgw.tgwRouteTableNameToIdMap.get(route) as string);
            }
          }

          const tgwAttachProps: TransitGatewayAttachmentProps = {
            vpcId: vpc.vpcId,
            subnetIds,
            transitGatewayId: tgw.tgwId,
            tgwRouteAssociates: tgwRouteAssociations,
            tgwRoutePropagates,
          };
          // Attach VPC To TGW
          new TransitGatewayAttachment(this, 'tgw_attach', tgwAttachProps);
        }
      }

      new InterfaceEndpoints(this, 'InterfaceEndpoints', {
        vpc,
        accountConfig: accountProps,
      });

      // Add Outputs to Stack

      // Adding Output for VPC
      new cdk.CfnOutput(this, `Vpc${vpcConfig.name}`, {
        value: vpc.vpcId,
      });

      // Adding Outputs for Subnets
      for (const [key, value] of vpc.subnets) {
        new cdk.CfnOutput(this, `${vpcConfig.name}Subnet${key}`, {
          value,
        });
      }

      // Adding Outputs for RouteTables
      for (const [key, value] of vpc.routeTableNameToIdMap) {
        new cdk.CfnOutput(this, `${vpcConfig.name}RouteTable${key}`, {
          value,
        });
      }
    }
  }
}
