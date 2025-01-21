/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

export function encodeBase64(text: any): Uint8Array {
  const base64 = Buffer.from(text, 'binary').toString('base64');
  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

export function decodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('binary');
}
