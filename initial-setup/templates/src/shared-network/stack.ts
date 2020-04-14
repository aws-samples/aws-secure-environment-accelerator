import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as kms from '@aws-cdk/aws-kms';
import { AccountConfig } from '@aws-pbmm/common-lambda/lib/config';
import { InterfaceEndpoints } from '../common/interface-endpoints';
import { Vpc } from '../common/vpc';
import { FlowLogs } from '../common/flow-logs';
import { TransitGateway } from '../common/transit-gateway';
import { TransitGatewayAttachment, TransitGatewayAttachmentProps } from '../common/transit-gateway-attachment';

export namespace SharedNetwork {
  export interface StackProps extends cdk.StackProps {
    accountConfig: AccountConfig;
  }

  export class Stack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: StackProps) {
      super(scope, id, props);

      const accountProps = props.accountConfig;

      // Create VPC, Subnets, RouteTables and Routes on Shared-Network Account
      const vpcConfig = accountProps.vpc!!;
      const vpc = new Vpc(this, 'vpc', vpcConfig);

      const kmsKey = new kms.Key(this, 'kms', {
        alias: 'PBMMAccel-Key',
        description: 'Key used to encrypt PBMM Accel s3 bucket',
        enableKeyRotation: false,
        enabled: true,
      });

      // bucket name format: pbmmaccel-{account #}-{region}
      const flowLogBucketName = `pbmmaccel-${props.env?.account}-ca-central-1-1`;

      // s3 bucket to collect vpc-flow-logs
      const s3BucketForVpcFlowLogs = new s3.CfnBucket(this, 's3', {
        bucketName: flowLogBucketName,
        publicAccessBlockConfiguration: {
          blockPublicAcls: true,
          blockPublicPolicy: true,
          ignorePublicAcls: true,
          restrictPublicBuckets: true,
        },
        versioningConfiguration: {
          status: 'enabled',
        },
        bucketEncryption: {
          serverSideEncryptionConfiguration: [
            {
              serverSideEncryptionByDefault: {
                sseAlgorithm: 'AWS-KMS',
                kmsMasterKeyId: kmsKey.keyId,
              },
            },
          ],
        },
        lifecycleConfiguration: {
          rules: [
            {
              id: 'PBMMAccel-s3-life-cycle-policy-rule-1',
              status: 'enabled',
              abortIncompleteMultipartUpload: {
                daysAfterInitiation: 7,
              },
              expirationInDays: 90,
              noncurrentVersionExpirationInDays: 90,
            },
          ],
        },
        replicationConfiguration: {
          role: 'arn:aws:iam::491550984887:role/AcceleratorPipelineRole',
          rules: [
            {
              id: 'PBMMAccel-s3-replication-rule-1',
              status: 'enabled',
              prefix: '',
              destination: {
                bucket: 'arn:aws:s3:::pbmmaccel-491550984887-ca-central-1/421338879487',
                account: 'arn:aws:organizations::120663061453:account/o-mp109j1eyo/491550984887',
                encryptionConfiguration: {
                  replicaKmsKeyId: 'arn:aws:kms:ca-central-1:421338879487:key/ccf0712b-b852-4dd8-9006-d10710c67cb5',
                },
                storageClass: 'Standard',
              },
              sourceSelectionCriteria: {
                sseKmsEncryptedObjects: {
                  status: 'encrypted',
                },
              },
            },
          ],
        },
      });

      // Creating FlowLog for VPC
      if (vpcConfig['flow-logs']) {
        const s3BucketCreated = s3.Bucket.fromBucketAttributes(this, id + `bucket`, {
          bucketArn: s3BucketForVpcFlowLogs.attrArn,
        });

        const flowLog = new FlowLogs(this, 'flowlog', { vpcId: vpc.vpcId, s3Bucket: s3BucketCreated });
      }

      // Creating TGW for Shared-Network Account
      const deployments = accountProps.deployments;
      const twgDeployment = deployments.tgw;
      const twgAttach = vpcConfig['tgw-attach'];
      if (twgDeployment) {
        const tgw = new TransitGateway(this, twgDeployment.name!!, twgDeployment);
        if (twgAttach) {
          // TBD Account Check

          // TBD TGW Name Check

          // **** Attach VPC to TGW ********
          // Prepare props for TGW Attachment
          let subnetIds: string[] = [];
          const vpcTgwAttach = vpcConfig['tgw-attach']!!;
          const vpcTgwAttachSubnets = vpcTgwAttach['attach-subnets']!!;
          for (const subnet of vpcTgwAttachSubnets) {
            subnetIds = subnetIds.concat(vpc.azSubnets.get(subnet) as string[]);
          }

          const tgwRouteAssociations: string[] = [];
          const tgwRoutePropagates: string[] = [];
          const vpcTgwRTAssociate = vpcTgwAttach['tgw-rt-associate']!!;
          for (const route of vpcTgwRTAssociate) {
            if (tgw.tgwRouteTableNameToIdMap && tgw.tgwRouteTableNameToIdMap.get(route)) {
              tgwRouteAssociations.push(tgw.tgwRouteTableNameToIdMap.get(route) as string);
            }
          }
          const vpcTgwRTPropagate = vpcTgwAttach['tgw-rt-propagate']!!;
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
    }
  }
}
