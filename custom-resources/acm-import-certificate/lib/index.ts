import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import { HandlerProperties } from '@custom-resources/acm-import-certificate-lambda';

const resourceType = 'Custom::AcmImportCertificate';

export interface AcmImportCertificateProps {
  name: string;
  certificateBucket: s3.IBucket;
  certificateBucketPath: string;
  privateKeyBucket: s3.IBucket;
  privateKeyBucketPath: string;
  certificateChainBucket?: s3.IBucket;
  certificateChainBucketPath?: string;
  ignoreLimitExceededException?: boolean;
  /**
   * @default cdk.RemovalPolicy.RETAIN
   */
  removalPolicy?: cdk.RemovalPolicy;
  roleName?: string;
}

/**
 * Custom resource implementation that creates log subscription for directory service.
 */
export class AcmImportCertificate extends cdk.Construct implements cdk.ITaggable {
  tags: cdk.TagManager = new cdk.TagManager(cdk.TagType.KEY_VALUE, 'AcmImportCertificate');

  private resource: cdk.CustomResource | undefined;

  constructor(scope: cdk.Construct, id: string, private readonly props: AcmImportCertificateProps) {
    super(scope, id);

    this.tags.setTag('Name', props.name);

    props.certificateBucket.grantRead(this.role);
    props.privateKeyBucket.grantRead(this.role);
    props.certificateChainBucket?.grantRead(this.role);
  }

  get certificateArn(): string {
    // Return a lazy value as the resource only gets created in the onPrepare phase
    return cdk.Lazy.stringValue({
      produce: () => this.resource!.getAttString('CertificateArn'),
    });
  }

  get role(): iam.IRole {
    return this.lambdaFunction.role!;
  }

  protected onPrepare() {
    const handlerProperties: HandlerProperties = {
      certificateBucketName: this.props.certificateBucket.bucketName,
      certificateBucketPath: this.props.certificateBucketPath,
      privateKeyBucketName: this.props.privateKeyBucket.bucketName,
      privateKeyBucketPath: this.props.privateKeyBucketPath,
      certificateChainBucketName: this.props.certificateChainBucket?.bucketName,
      certificateChainBucketPath: this.props.certificateChainBucketPath,
      ignoreLimitExceededException: this.props.ignoreLimitExceededException,
      tags: this.tags.renderTags(),
    };

    // Create the resource in the onPrepare phase to make the renderTags() work properly
    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      removalPolicy: this.props.removalPolicy ?? cdk.RemovalPolicy.RETAIN,
      properties: handlerProperties,
    });
  }

  private get lambdaFunction(): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@custom-resources/acm-import-certificate-lambda');
    const lambdaDir = path.dirname(lambdaPath);

    const role = new iam.Role(stack, 'Role', {
      roleName: this.props.roleName,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'acm:AddTagsToCertificate',
          'acm:ImportCertificate',
          'kms:Decrypt',
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'tag:GetResources',
        ],
        resources: ['*'],
      }),
    );

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
      timeout: cdk.Duration.seconds(10),
    });
  }
}
