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

declare module 'siem-common' {
  function errorHandler(
    onEvent: (event: CloudFormationCustomResourceEvent) => Promise<ErrorHandlerResponse | undefined | void>,
  );
  function throttlingBackOff<T>(
    request: () => Promise<T>,
    options?: Partial<Omit<IBackOffOptions, 'retry'>>,
  ): Promise<T>;
  class S3 {
    async getObjectBody(input: s3.GetObjectRequest): Promise<s3.Body>;
    async getObjectBodyAsString(input: s3.GetObjectRequest): Promise<string>;
    async putObject(input: s3.PutObjectRequest): Promise<s3.PutObjectOutput>;
  }
}

declare module 'querystring' {
  function encode(string);
}
