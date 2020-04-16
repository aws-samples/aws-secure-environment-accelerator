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
      const vpc = new Vpc(this, 'vpc', vpcConfig);

      // execution role arn's
      const sharedNetworkAccelExecRoleArn = `arn:aws:iam::${props.env?.account}:role/${props.acceleratorExecutionRoleName}`;
      const logArchiveAccelExecRoleArn = `arn:aws:iam::${props.logArchiveAccountId}:role/${props.acceleratorExecutionRoleName}`;

      // get the role from arn
      const accelExecRoleArn = iam.Role.fromRoleArn(this, id + `role`, sharedNetworkAccelExecRoleArn);

      // permissions required for s3 replication
      const s3ReplicationPolicyStatement = new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['iam:GetRole', 'iam:PassRole'],
        resources: [logArchiveAccelExecRoleArn],
      });

      // add permisssions necessary for s3 replication to the accelerator execution role
      accelExecRoleArn.addToPolicy(s3ReplicationPolicyStatement);

      // kms key used for vpc-flow-logs s3 bucket encryption
      const kmsKey = new kms.Key(this, 'kmsKeyForVpcFlowLogsS3', {
        alias: 'PBMMAccel-Key',
        description: 'Key used to encrypt PBMM Accel s3 bucket',
        enableKeyRotation: false,
        enabled: true,
      });

      // bucket name format: pbmmaccel-{account #}-{region}
      const flowLogBucketName = `pbmmaccel-${props.env?.account}-ca-central-1`;

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
          role: sharedNetworkAccelExecRoleArn,
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
                  owner: 'Destination'
                },
              },
            },
          ],
        },
      });

      // Creating FlowLog for VPC
      if (vpcConfig['flow-logs']) {
        // const s3BucketCreated = s3.Bucket.fromBucketAttributes(this, id + `bucket`, {
        //   bucketArn: s3BucketForVpcFlowLogs.attrArn,
        // });
        
        const flowLog = new FlowLogs(this, 'flowlog', { vpcId: vpc.vpcId, s3Bucket: s3BucketForVpcFlowLogs });
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
