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

export interface CreateAccountInput {
  accountId?: string;
  accountName: string;
  emailAddress: string;
  organizationalUnit: string;
  accountKey: string;
}

export type CreateAccountOutputStatus =
  | 'SUCCESS'
  | 'FAILURE'
  | 'ALREADY_EXISTS'
  | 'NOT_RELEVANT'
  | 'NON_MANDATORY_ACCOUNT_FAILURE';

export type OrganizationAccountOutputStatus = 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | string;

export interface CreateAccountOutput {
  status?: CreateAccountOutputStatus | OrganizationAccountOutputStatus;
  statusReason?: string;
  provisionedProductStatus?: string;
  provisionToken?: string;
}

export type AccountAvailableStatus =
  | 'SUCCESS'
  | 'FAILURE'
  | 'IN_PROGRESS'
  | 'NON_MANDATORY_ACCOUNT_FAILURE'
  | 'NOT_EXISTS';

export interface AccountAvailableOutput {
  status?: AccountAvailableStatus | OrganizationAccountOutputStatus;
  statusReason?: string;
  provisionedProductStatus?: string;
  provisionToken?: string;
}
