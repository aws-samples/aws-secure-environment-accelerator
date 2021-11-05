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
 import * as kms from '@aws-cdk/aws-kms';
 import * as ec2 from '@aws-cdk/aws-ec2';
 import * as sqs from '@aws-cdk/aws-sqs';
 
 
 export interface SqsConfigurationProps {
    queueName: string,
    visibilityTimeout?: number;  
 }
 
 
 export class Sqs extends cdk.Construct {
 
   private readonly resource: sqs.Queue;
 
   constructor(scope: cdk.Construct, id: string, private readonly props: SqsConfigurationProps) {
     super(scope, id);
 
     const { queueName, visibilityTimeout = 0} = props;
          
     this.resource = new sqs.Queue(this, 'Queue',{
        queueName,
        visibilityTimeout: cdk.Duration.seconds(visibilityTimeout)        
     });
 
   }
 
   get name(): string {
     return this.resource.queueName!;
   }
   
   get arn(): string {
     return this.resource.queueArn;
   }

   get IQueue(): sqs.IQueue {
       return this.resource;
   }
 
 }
 