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

import aws from './aws-client';
import { v4 as uuidv4 } from 'uuid';
import { ServiceCatalog } from './service-catalog';
import { STS } from './sts';
import { CreateAccountInput, CreateAccountOutput, AccountAvailableOutput } from './types/account';
import { throttlingBackOff } from './backoff';
import * as crypto from 'crypto';

export interface CreateAvmAccountInput extends CreateAccountInput {
  avmPortfolioName: string;
  avmProductName: string;
}
export class AccountVendingMachine {
  private readonly client: ServiceCatalog;
  private readonly sts: STS;

  public constructor(credentials?: aws.Credentials) {
    this.client = new ServiceCatalog(credentials);
    this.sts = new STS(credentials);
  }

  /**
   * Create account using account-vending-machine
   */
  async createAccount(input: CreateAvmAccountInput): Promise<CreateAccountOutput> {
    const {
      avmPortfolioName,
      avmProductName,
      accountName,
      emailAddress,
      organizationalUnit,
      accountKey,
      accountId,
    } = input;

    // find service catalog portfolioId by name
    const portfolio = await throttlingBackOff(() => this.client.findPortfolioByName(avmPortfolioName));
    const portfolioId = portfolio?.Id;
    if (!portfolioId) {
      return {
        status: 'FAILURE',
        statusReason: `Unable to find service catalog portfolio with name "${avmPortfolioName}".`,
      };
    }

    // find service catalog ProductId by name
    const searchProductsOutput = await throttlingBackOff(() => this.client.findProduct(avmProductName));
    const productId = searchProductsOutput?.ProductViewSummaries?.[0]?.ProductId;
    if (!productId) {
      return {
        status: 'FAILURE',
        statusReason: `Unable to find service catalog product with name "${avmProductName}".`,
      };
    }

    // find service catalog Product - ProvisioningArtifactId by ProductId
    const listProvisioningArtifactsOutput = await throttlingBackOff(() =>
      this.client.findProvisioningArtifact(productId),
    );
    const provisioningArtifact = listProvisioningArtifactsOutput?.ProvisioningArtifactDetails?.find(a => a.Active);
    const provisioningArtifactId = provisioningArtifact?.Id;
    if (!provisioningArtifactId) {
      return {
        status: 'FAILURE',
        statusReason: `Unable to find service catalog product provisioning artifact for product "${productId}".`,
      };
    }

    const provisionToken = uuidv4();
    // launch AVM Product
    let provisionProductOutput;
    try {
      provisionProductOutput = await throttlingBackOff(() =>
        this.client.provisionProduct({
          ProductId: productId,
          ProvisionToken: provisionToken,
          ProvisioningArtifactId: provisioningArtifactId,
          ProvisionedProductName: accountKey,
          ProvisioningParameters: [
            {
              Key: 'AccountName',
              Value: accountName,
            },
            {
              Key: 'AccountEmail',
              Value: emailAddress,
            },
            {
              Key: 'ManagedOrganizationalUnit',
              Value: organizationalUnit,
            },
            {
              Key: 'SSOUserEmail',
              Value: emailAddress,
            },
            {
              Key: 'SSOUserFirstName',
              Value: accountName,
            },
            {
              Key: 'SSOUserLastName',
              Value: accountName,
            },
            {
              Key: 'VPCOptions',
              Value: 'No-Primary-VPC' /* CA PBMM requirement. Please do not alter. */,
            },
            {
              Key: 'VPCRegion',
              Value: 'ca-central-1' /* CA PBMM requirement. Please do not alter. */,
            },
            {
              Key: 'VPCCidr',
              Value: '10.0.0.0/16' /* CA PBMM requirement. Please do not alter. */,
            },
            {
              Key: 'PeerVPC',
              Value: 'false' /* CA PBMM requirement. Please do not alter. */,
            },
          ],
        }),
      );
    } catch (e) {
      console.log('Exception Message: ' + e.message);
      if (e.message === 'A stack named ' + accountName + ' already exists.') {
        return {
          status: 'ALREADY_EXISTS',
          statusReason: accountName + ' account already exists!',
          provisionedProductStatus: 'ALREADY_EXISTS',
        };
      }
      throw e;
    }

    const provisionedProductStatus = provisionProductOutput?.RecordDetail?.Status;
    if (provisionedProductStatus !== 'CREATED') {
      return {
        status: 'FAILURE',
        statusReason: 'Unable to create ' + accountName + ' account using Account Vending Machine!',
        provisionedProductStatus,
        provisionToken,
      };
    }
    return {
      status: 'SUCCESS',
      statusReason: accountName + ' account created successfully using Account Vending Machine!',
      provisionedProductStatus,
      provisionToken,
    };
  }

  /**
   * Is the account created using account-vending-machine available now?
   * @param accountName
   */
  async isAccountAvailable(accountName: string): Promise<AccountAvailableOutput> {
    const SearchProvisionedProductsOutput = await throttlingBackOff(() =>
      this.client.searchProvisionedProducts(accountName),
    );
    console.log(JSON.stringify(SearchProvisionedProductsOutput, null, 2));
    const provisionedProductStatus = SearchProvisionedProductsOutput?.ProvisionedProducts?.[0]?.Status;

    if (provisionedProductStatus === 'AVAILABLE') {
      return {
        status: 'SUCCESS',
        statusReason: `${accountName} account created successfully using Account Vending Machine!`,
        provisionedProductStatus,
      };
    } else if (provisionedProductStatus === 'UNDER_CHANGE' || provisionedProductStatus === 'PLAN_IN_PROGRESS') {
      return {
        status: 'IN_PROGRESS',
        statusReason: `${accountName} account is being created using Account Vending Machine!`,
        provisionedProductStatus,
      };
    }
    return {
      status: 'FAILURE',
      statusReason: `Unable to create ${accountName} account using Account Vending Machine!`,
      provisionedProductStatus,
    };
  }

  /**
   * Is the account created using account-vending-machine available now?
   * @param accountName
   */
  async isAccountAvailableByAccountId(accountId: string): Promise<AccountAvailableOutput> {
    const SearchProvisionedProductsOutput = await throttlingBackOff(() =>
      this.client.searchProvisionedProductsForSingleAccount(accountId),
    );
    console.log(JSON.stringify(SearchProvisionedProductsOutput, null, 2));
    const provisionedProductStatus = SearchProvisionedProductsOutput?.[0]?.Status;

    if (provisionedProductStatus === 'AVAILABLE') {
      return {
        status: 'SUCCESS',
        statusReason: `${accountId} account created successfully using Account Vending Machine!`,
        provisionedProductStatus,
      };
    } else if (provisionedProductStatus === 'UNDER_CHANGE' || provisionedProductStatus === 'PLAN_IN_PROGRESS') {
      return {
        status: 'IN_PROGRESS',
        statusReason: `${accountId} account is being created using Account Vending Machine!`,
        provisionedProductStatus,
      };
    }
    return {
      status: 'FAILURE',
      statusReason: `Unable to create ${accountId} account using Account Vending Machine!`,
      provisionedProductStatus,
    };
  }

  async getAccountStatus(accountName: string): Promise<AccountAvailableOutput> {
    const SearchProvisionedProductsOutput = await throttlingBackOff(() =>
      this.client.searchProvisionedProducts(accountName),
    );
    const provisionedProductStatus = SearchProvisionedProductsOutput?.ProvisionedProducts?.[0]?.Status;

    if (provisionedProductStatus === 'AVAILABLE') {
      return {
        status: 'SUCCESS',
        statusReason: accountName + ' account created successfully using Account Vending Machine!',
        provisionedProductStatus,
      };
    } else if (provisionedProductStatus === 'UNDER_CHANGE' || provisionedProductStatus === 'PLAN_IN_PROGRESS') {
      return {
        status: 'IN_PROGRESS',
        statusReason: accountName + ' account is being created using Account Vending Machine!',
        provisionedProductStatus,
      };
    }
    return {
      status: 'NOT_EXISTS',
      statusReason: 'Account ' + accountName + ' is not enrolled in Control Tower',
      provisionedProductStatus,
    };
  }
}

function hashName(name: string, length: number) {
  const hash = crypto.createHash('md5').update(name).digest('hex');
  return hash.slice(0, length).toUpperCase();
}
