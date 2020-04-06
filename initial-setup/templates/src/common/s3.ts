import * as cdk from '@aws-cdk/core';
import { BucketProps } from '@aws-pbmm/common-cdk/node_modules/@aws-cdk/aws-s3';

export interface s3Props {
  bucketName: string;
  bucketRegion: string;
}

export class s3 extends cdk.Construct {
  readonly s3Id: string;
  
  constructor(parent: cdk.Construct, name: 's3', props: BucketProps) {
    super(parent, name);

    //TODO: 
    
    this.s3Id = '';
  }
}
