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
import {
  AssociatePrincipalWithPortfolioOutput,
  ListPortfoliosOutput,
  ListPrincipalsForPortfolioOutput,
  ListProvisioningArtifactsOutput,
  PortfolioDetail,
  ProvisionProductInput,
  ProvisionProductOutput,
  ScanProvisionedProductsOutput,
  SearchProductsOutput,
  SearchProvisionedProductsOutput,
  ProvisionedProductDetail,
  Principal,
  ProvisionedProductAttribute,
} from 'aws-sdk/clients/servicecatalog';
import { throttlingBackOff } from './backoff';

export interface ProductAVMParam {
  accountName: string;
  accountEmail: string;
  orgUnitName: string;
}

export class ServiceCatalog {
  private readonly client: aws.ServiceCatalog;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.ServiceCatalog({
      credentials,
    });
  }

  /**
   * List service catalog portfolios
   */
  async listPortfolios(): Promise<PortfolioDetail[]> {
    const portfolios = [];
    let nextToken: string | undefined;
    do {
      const portfoliosResponse: ListPortfoliosOutput = await throttlingBackOff(() =>
        this.client.listPortfolios({ PageToken: nextToken }).promise(),
      );
      if (portfoliosResponse.PortfolioDetails) {
        portfolios.push(...portfoliosResponse.PortfolioDetails);
      }
      nextToken = portfoliosResponse.NextPageToken;
    } while (nextToken);

    return portfolios;
  }

  async listPrincipalsForPortfolio(portfolioId: string): Promise<Principal[]> {
    const principals = [];
    let nextToken: string | undefined;
    do {
      const principalsResponse: ListPrincipalsForPortfolioOutput = await throttlingBackOff(() =>
        this.client
          .listPrincipalsForPortfolio({
            PortfolioId: portfolioId,
            PageToken: nextToken,
          })
          .promise(),
      );

      if (principalsResponse.Principals) {
        principals.push(...principalsResponse.Principals);
      }
      nextToken = principalsResponse.NextPageToken;
    } while (nextToken);

    return principals;
  }

  async findPortfolioByName(portfolioName: string): Promise<PortfolioDetail | undefined> {
    const portfolios = await this.listPortfolios();
    return portfolios.find(p => p.DisplayName === portfolioName);
  }

  /**
   * Associate Role with service catalog Portfolio
   * @param portfolioId
   * @param prinicipalArn
   */
  async associateRoleWithPortfolio(
    portfolioId: string,
    prinicipalArn: string,
  ): Promise<AssociatePrincipalWithPortfolioOutput> {
    return throttlingBackOff(() =>
      this.client
        .associatePrincipalWithPortfolio({
          PortfolioId: portfolioId,
          PrincipalARN: prinicipalArn,
          PrincipalType: 'IAM',
        })
        .promise(),
    );
  }

  /**
   * Find service catalog product by name
   * @param productName
   */
  async findProduct(productName: string): Promise<SearchProductsOutput> {
    return throttlingBackOff(() =>
      this.client
        .searchProducts({
          Filters: {
            FullTextSearch: [productName],
          },
        })
        .promise(),
    );
  }

  /**
   * Find service catalog provisioningArtifact by productId
   * @param productId
   */
  async findProvisioningArtifact(productId: string): Promise<ListProvisioningArtifactsOutput> {
    return throttlingBackOff(() =>
      this.client
        .listProvisioningArtifacts({
          ProductId: productId,
        })
        .promise(),
    );
  }

  async provisionProduct(input: ProvisionProductInput): Promise<ProvisionProductOutput> {
    return throttlingBackOff(() =>
      this.client
        .provisionProduct({
          ...input,
          Tags: [
            ...(input.Tags || []),
            {
              Key: 'Accelerator',
              Value: 'PBMM',
            },
          ],
        })
        .promise(),
    );
  }

  /**
   * Search provisioned products to check status of newly provisioned product
   * @param accountName
   */
  async searchProvisionedProducts(accountName: string): Promise<SearchProvisionedProductsOutput> {
    return throttlingBackOff(() =>
      this.client
        .searchProvisionedProducts({
          Filters: {
            SearchQuery: ['name:' + accountName],
          },
          AccessLevelFilter: {
            Key: 'Account',
            Value: 'self',
          },
        })
        .promise(),
    );
  }

  /**
   * Returns all accounts managed by control tower
   * @returns
   */
  async searchProvisionedProductsForAllAccounts(): Promise<ProvisionedProductAttribute[]> {
    const provisionedControlTowerAccountProducts = [];
    let nextToken: string | undefined;
    do {
      const provisionedProductsResponse = await throttlingBackOff(() =>
        this.client
          .searchProvisionedProducts({
            Filters: {
              SearchQuery: ['type:CONTROL_TOWER_ACCOUNT'],
            },
            AccessLevelFilter: {
              Key: 'Account',
              Value: 'self',
            },
            PageToken: nextToken,
          })
          .promise(),
      );
      if (provisionedProductsResponse.ProvisionedProducts) {
        provisionedControlTowerAccountProducts.push(...provisionedProductsResponse.ProvisionedProducts);
      }
      nextToken = provisionedProductsResponse.NextPageToken;
    } while (nextToken);
    return provisionedControlTowerAccountProducts;
  }

  /**
   * Returns control data for account
   * @param accountId
   * @returns
   */
  async searchProvisionedProductsForSingleAccount(accountId: string): Promise<ProvisionedProductAttribute[]> {
    const provisionedAccountProducts = [];
    let nextToken: string | undefined;
    do {
      const provisionedProductsResponse = await throttlingBackOff(() =>
        this.client
          .searchProvisionedProducts({
            Filters: {
              SearchQuery: ['physicalId:' + accountId],
            },
            AccessLevelFilter: {
              Key: 'Account',
              Value: 'self',
            },
            PageToken: nextToken,
          })
          .promise(),
      );
      if (provisionedProductsResponse.ProvisionedProducts) {
        provisionedAccountProducts.push(...provisionedProductsResponse.ProvisionedProducts);
      }
      nextToken = provisionedProductsResponse.NextPageToken;
    } while (nextToken);
    return provisionedAccountProducts;
  }

  async scanProvisionedProducts(): Promise<ProvisionedProductDetail[]> {
    const provisionedProducts = [];
    let nextToken: string | undefined;
    do {
      const scanProvisionedProductsRequest = await throttlingBackOff(() =>
        this.client
          .scanProvisionedProducts({
            AccessLevelFilter: {
              Key: 'Account',
              Value: 'self',
            },
            PageToken: nextToken,
          })
          .promise(),
      );
      if (scanProvisionedProductsRequest.ProvisionedProducts) {
        provisionedProducts.push(...scanProvisionedProductsRequest.ProvisionedProducts);
      }
      nextToken = scanProvisionedProductsRequest.NextPageToken;
    } while (nextToken);
    return provisionedProducts;
  }
}
