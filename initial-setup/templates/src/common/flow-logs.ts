import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';

// import { VpcConfig } from '@aws-pbmm/common-lambda/lib/config';
import { Bucket } from '@aws-cdk/aws-s3';

// interface S3StackProps extends cdk.StackProps {
//     vpc: Vpc;
// }

// export class FlowLogs extends cdk.Construct {
export class FlowLogsStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id);

        //TODO need to dynamically get the bucket
        const s3Bucket = Bucket.fromBucketAttributes(this, 'TestBucket', {
            bucketArn: 'arn:aws:s3:::vpcflowlog-bucket'
        });

        // const flowLogRole = new iam.Role(this, 'RoleFlowLogs', {
        //     roleName: 'AcceleratorVPCFlowLogsRole',
        //     assumedBy: new iam.ServicePrincipal("vpc-flow-logs.amazonaws.com"),
        // });

        // flowLogRole.addToPolicy(
        //     new iam.PolicyStatement({
        //         effect: iam.Effect.ALLOW,
        //         actions: ["*"],
        //         resources: [s3Bucket.bucketArn],
        //     }),
        // );

        new ec2.CfnFlowLog(this, "VPCFlowLog", {
            // deliverLogsPermissionArn: flowLogRole.roleArn,
            resourceId: "vpc-02b9b07d988189f34",
            resourceType: "VPC",
            trafficType: "ALL",
            logDestination: "arn:aws:s3:::vpcflowlog-bucket",
            logDestinationType: "s3"
        });
    }
}